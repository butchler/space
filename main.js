// Constants
var width = 700, height = 500    // Canvas size.
var size = 15                    // Player size.
var attractionDamping = 0.001    // Constant of proportionality for mouse attraction.
var drag = 0.99                  // Drag from "air friction" (I thought we were in space?)
var friction = 0.5               // "Friction" from hitting a wall.
var boost = 5                    // Speed you receive when you "boost".
var fps = 60                     // Frames per second.
var networkDelay = 200           // Milliseconds between network updates.
var frameDelay = 1000 / fps

// Connect to Firebase.
var root = new Firebase('ssspppaaaccceee.firebaseio.com')

// Initialize canvas.
var canvas = document.getElementById('canvas')
canvas.width = width
canvas.height = height
var g = canvas.getContext('2d')

function makeGame() {
    joinGame(root.child('games').push().name())
}

function joinGame(gameId) {
    var gameRef = root.child('games').child(gameId)
    var playerId = gameRef.push().name()
    startGame(gameRef, playerId)

    console.log('joinGame', gameId, playerId)
}

// Get the initial game state and add ourselves to it.
function initPlayerState(gameRef, us, doneCallback) {
    gameRef.transaction(function(state) {
        if (state === null)
            state = {}

        // Determine what our color should be.
        var colors = ['blue', 'red', 'green', 'purple', 'yellow', 'magenta', 'cyan']

        // Delete all of the colors that are already being used by other players.
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                var index = colors.indexOf(state[player].color)
                if (index >= 0)
                    delete colors[index]
            }
        }

        // Take the first color that wasn't deleted.
        var color = null
        for (i in colors) {
            if (colors.hasOwnProperty(i)) {
                color = colors[i]
                break
            }
        }

        // All of the colors are already taken, so we can't join.
        if (color === null) {
            console.log("Too many players in game to join.")
            return
        }

        // Add our initial state to the game state.
        state[us] = {
            x: width / 2, y: height / 2,
            dx: 0, dy: 0,
            mouseX: width / 2, mouseY: height / 2,
            color: color
        }

        return state
    }, function(error, committed, snapshot) {
        if (!error && committed) {
            var state = snapshot.val()
            console.log('initial state', state)
            doneCallback(state)
        } else {
            console.log('error', error, 'committed', committed, 'snapshot', snapshot)
        }
    })
}

function movePlayer(player) {
    // Move ourself towards the mouse in proportion to how far away they
    // are from the mouse (the farther we are from the mouse, the faster we
    // move towards it).
    player.dx += (player.mouseX - player.x) * attractionDamping
    player.dy += (player.mouseY - player.y) * attractionDamping

    // Move player.
    player.x += player.dx
    player.y += player.dy

    // Slow player down a little bit over time.
    player.dx *= drag
    player.dy *= drag

    // Keep player in bounds by making them bounce off walls,
    // reducing their speed a little bit.
    if (player.x > width) player.dx = -Math.abs(player.dx) * friction
    if (player.x < 0) player.dx = Math.abs(player.dx) * friction
    if (player.y > height) player.dy = -Math.abs(player.dy) * friction
    if (player.y < 0) player.dy = Math.abs(player.dy) * friction
}

function drawPlayer(player) {
    g.fillStyle = player.color
    //g.fillRect(player.x, player.y, size, size)
    g.beginPath()
    g.arc(player.x, player.y, size, 0, 2 * Math.PI, false)
    g.fill()
}

function magnitude(x, y) {
    return Math.sqrt(x*x + y*y)
}

function normal(x, y) {
    var mag = magnitude(x, y)
    return {
        x: x / mag,
        y: y / mag
    }
}

function handleCollisions(gameRef, state) {
    // For every pair of players:
    var seen = {}
    for (player in state) {
        if (state.hasOwnProperty(player)) {
            for (otherPlayer in state) {
                if (state.hasOwnProperty(otherPlayer) &&
                        player !== otherPlayer && !seen[player + otherPlayer]) {
                    seen[player + otherPlayer] = true
                    seen[otherPlayer + player] = true

                    var p = state[player], o = state[otherPlayer]

                    // If circles overlap:
                    if (magnitude(p.x - o.x, p.y - o.y) < size * 2) {
                        // Crazy/stupid collision handling!
                        /*var k = 1 + 2*Math.random()
                        p.dx *= -k; p.dy *= -k
                        o.dx *= -k; o.dy *= -k*/

                        // Represents direction from otherPlayer to player, or
                        // the alternatively the direction from player away
                        // from otherPlayer.
                        var away = normal(p.x - o.x, p.y - o.y)
                        var centerX = (p.x + o.x) / 2, centerY = (p.y + o.y) / 2
                        p.x = centerX + away.x * size; p.y = centerY + away.y * size;
                        o.x = centerX - away.x * size; o.y = centerY - away.y * size;
                        k = 5
                        p.dx += k * away.x; p.dy += k * away.y
                        o.dx -= k * away.x; o.dy -= k * away.y

                        /*var k = 5
                        o.dx *= k * n.x; o.dy *= k * n.y
                        p.dx *= -k * n.x; p.dy *= -k * n.y*/

                        // Immediately publish states when two players collide.
                        // TODO: Use update instead of set so that only one network update is sent.
                        newStates = {}
                        newStates[player] = p
                        newStates[player].overwrite = true
                        newStates[otherPlayer] = o
                        newStates[otherPlayer].overwrite = true
                        gameRef.update(newStates)
                    }
                }
            }
        }
    }
}

// gameRef is a Firebase reference to the game state, and us is a string
// containing our player id. gameRef.child(id) will hold our current state.
function startGame(gameRef, us) {
    console.log('startGame', gameRef.toString(), us)

    var host
    gameRef.on('child_added', function(childSnapshot, prevChildName) {
        var isFirstChild = prevChildName === null
        if (isFirstChild) {
            host = childSnapshot.name()
            console.log('new host', host)
        }
    })

    initPlayerState(gameRef, us, function(state) {
        var our = state[us]

        // Every frame:
        setInterval(function() {
            // Clear screen.
            g.fillStyle = 'black'
            g.fillRect(0, 0, width, height)

            // For each player:
            for (player in state) {
                if (state.hasOwnProperty(player)) {
                    movePlayer(state[player])
                    drawPlayer(state[player])
                }
            }

            // The only actual privilege the host has is that they are the only
            // one that does collision handling.
            if (us === host)
                handleCollisions(gameRef, state)
        }, frameDelay)

        // Publish our current state every once in a while so that other
        // players can see it.
        setInterval(function() { gameRef.child(us).set(state[us]) }, networkDelay)

        // When the other players publish their states, copy it into our state.
        gameRef.on('child_added', function(childSnapshot, prevChildName) {
            var player = childSnapshot.name()

            if (player === us)
                // Ignore local updates.
                return

            var playerState = childSnapshot.val()
            state[player] = playerState

            console.log(state[player].color, 'player added')
        })
        gameRef.on('child_changed', function(childSnapshot, prevChildName) {
            var player = childSnapshot.name()

            var newPlayerState = childSnapshot.val()
            if (player !== us || newPlayerState.overwrite) {
                state[player] = newPlayerState
                if (player === us) {
                    our = state[player]
                    delete our.overwrite
                }
            }
        })
        gameRef.on('child_removed', function(oldChildSnapshot) {
            var player = oldChildSnapshot.name()
            console.log(state[player].color, 'player removed')
            delete state[player]
        })

        // Tell the Firebase server to remove our state when the user
        // disconnects or closes their tab/window.
        gameRef.child(us).onDisconnect().remove()

        canvas.onmousemove = function(e) {
            // Keep track of the mouse position.
            our.mouseX = e.pageX - canvas.offsetLeft
            our.mouseY = e.pageY - canvas.offsetTop
        }
        document.onkeypress = function(e) {
             // Pressing one of the directional keys "boosts" the player by giving
            // it a constant speed in that direction, instantly nullifying its
            // previous speed in that direction.
            var key = String.fromCharCode(e.which)
            if (key === 'w' || key === 'W') our.dy = -boost
            else if (key === 'a' || key === 'A') our.dx = -boost
            else if (key === 's' || key === 'S') our.dy = boost
            else if (key === 'd' || key === 'D') our.dx = boost
        }
    })
}
