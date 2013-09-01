// Constants
var width = 800, height = 400    // Canvas size.
var size = 20                    // Player size.
var attractionDamping = 0.001    // Constant of proportionality for mouse attraction.
var drag = 0.99                  // Drag from "air friction" (I thought we were in space?)
var friction = 0.5               // "Friction" from hitting a wall.
var boost = 5                    // Speed you receive when you "boost".
var fps = 60                     // Frames per second.
var networkDelay = 300           // Milliseconds between network updates.
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

function joinGame(id) {
    var gameRef = root.child('games').child(id)
    var playerId = gameRef.push().name()
    startGame(gameRef, playerId)

    console.log('joinGame', id, playerId)
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

    var host = us
    gameRef.on('child_added', function(childSnapshot, prevChildName) {
        var isFirstChild = prevChildName === null
        if (isFirstChild)
            host = childSnapshot.name()
    })

    initPlayerState(gameRef, us, function(state) {
        var mouseX = width / 2, mouseY = height / 2

        // Every frame:
        setInterval(function() {
            // Move ourself towards the mouse in proportion to how far away they
            // are from the mouse (the farther we are from the mouse, the faster we
            // move towards it).
            var our = state[us]
            our.dx += (mouseX - our.x) * attractionDamping
            our.dy += (mouseY - our.y) * attractionDamping

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
        gameRef.on('value', function(snapshot) {
            if (snapshot.val() !== null) {
                //ourState = state[us]
                state = snapshot.val()
                //state[us] = ourState

                // Do client side prediction here.
                // var numFrames = networkDelay / frameDelay
                // if (large enough difference in local and remote state)
                //     simulate numFrames frames for the client's player
                var numFrames = networkDelay / frameDelay / 2
                for (var i = 0; i < numFrames; i++) {
                    for (player in state) {
                        if (state.hasOwnProperty(player)) {
                            movePlayer(state[player])
                        }
                    }
                }
            }
        })

        gameRef.child(us).onDisconnect().remove()

        canvas.onmousemove = function(e) {
            // Keep track of the mouse position.
            mouseX = e.pageX - canvas.offsetLeft
            mouseY = e.pageY - canvas.offsetTop
        }
        document.onkeypress = function(e) {
            // Pressing one of the directional keys "boosts" the player by giving
            // it a constant speed in that direction, instantly nullifying its
            // previous speed in that direction.
            var key = String.fromCharCode(e.which)
            if (key === "w" || key === "W") state[us].dy = -boost
            else if (key === "a" || key === "A") state[us].dx = -boost
            else if (key === "s" || key === "S") state[us].dy = boost
            else if (key === "d" || key === "D") state[us].dx = boost
        }
    })
}
