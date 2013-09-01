// Constants
var width = 700, height = 500    // Canvas size.
var size = 20                    // Player size.
var attractionDamping = 0.001    // Constant of proportionality for mouse attraction.
var drag = 0.99                  // Drag from "air friction" (I thought we were in space?)
var friction = 0.5               // "Friction" from hitting a wall.
var boost = 5                    // Speed you receive when you "boost".
var fps = 60                     // Frames per second.
var networkDelay = 1000           // Milliseconds between network updates.
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
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                var index = colors.indexOf(state[player].color)
                if (index >= 0)
                    delete colors[index]
            }
        }

        // Find the first color that wasn't deleted.
        var color = null
        for (i in colors) {
            if (colors.hasOwnProperty(i)) {
                color = colors[i]
                break
            }
        }

        if (color === null) {
            // All of the colors are already taken, so we can't join.
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
    g.fillRect(player.x, player.y, size, size)
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

            // Collision detection. The only actual privilege that the host
            // has is that they are the only one that does collision handling.
            if (us === host) {
                // For every pair of players:
                for (player in state) {
                    if (state.hasOwnProperty(player)) {
                        for (otherPlayer in state) {
                            if (state.hasOwnProperty(otherPlayer) && player !== otherPlayer) {
                                var p = state[player], o = state[otherPlayer]
                                // If squares overlap:
                                if (p.x < o.x + size && p.x + size > o.x &&
                                    p.y < o.y + size && p.y + size > o.y) {
                                    // Crazy/stupid collision handling!
                                    var k = 1 + 2*Math.random()
                                    p.dx *= -k; p.dy *= -k
                                    o.dx *= -k; o.dy *= -k

                                    // Immediately publish states when two players collide.
                                    // TODO: Use update instead of set so that only one network update is sent.
                                    gameRef.child(player).set(p)
                                    gameRef.child(otherPlayer).set(o)
                                }
                            }
                        }
                    }
                }
            }
        }, frameDelay)

        setInterval(function() {
            // Publish our current state every once in a while so that other
            // players can see it.
            gameRef.child(us).set(state[us])
        }, networkDelay)

        // When the other players publish their states, copy it into our state.
        var lastUpdate, total = count = 0
        gameRef.on('child_added', function(childSnapshot, prevChildName) {
            var player = childSnapshot.name()

            if (player === us)
                // Ignore local updates.
                return

            var playerState = childSnapshot.val()
            state[player] = playerState

            lastUpdate = Date.now()

            console.log(state[player].color, 'player added')
        })
        gameRef.on('child_changed', function(childSnapshot, prevChildName) {
            var player = childSnapshot.name()

            if (player === us)
                // Ignore local updates.
                return

            var newPlayerState = childSnapshot.val()
            state[player] = newPlayerState

            // Do client-side prediction. Players send their updated state out
            // every networkDelay milliseconds, but by the time that update
            // reaches us, we will already be a couple of milliseconds in the
            // future, so we need to update the players state by a couple of frames.

            // Find the recent average network delay.
            var delay = Date.now() - lastUpdate
            lastUpdate = Date.now()
            total += delay
            count += 1
            var averageDelay = total / count
            if (count > 50) {
                total -= averageDelay
                count -= 1
            }

            var numFrames = (averageDelay / 2) / frameDelay
            numFrames = 0
            console.log(numFrames)
            for (var i = 0; i < numFrames; i++) {
                movePlayer(state[player])
            }
        })
        gameRef.on('child_removed', function(oldChildSnapshot) {
            var player = oldChildSnapshot.name()
            console.log(state[player].color, 'player removed')
            delete state[player]
        })

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
            if (key === "w" || key === "W") our.dy = -boost
            else if (key === "a" || key === "A") our.dx = -boost
            else if (key === "s" || key === "S") our.dy = boost
            else if (key === "d" || key === "D") our.dx = boost
        }
    })
}
