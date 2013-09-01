var root = new Firebase('ssspppaaaccceee.firebaseio.com')

var width = 800, height = 400    // Canvas size.
var size = 20                    // Player size.
var attractionDamping = 0.001    // Constant of proportionality for mouse attraction.
var drag = 0.99                  // Drag from "air friction" (I thought we were in space?)
var friction = 0.5               // "Friction" from hitting a wall.
var boost = 5                    // Speed you receive when you "boost".
var fps = 60                     // Frames per second.
var networkDelay = 200           // Milliseconds between network updates.
var frameDelay = 1000 / fps

var canvas = document.getElementById('canvas')
canvas.width = width
canvas.height = height
var g = canvas.getContext('2d')

function makeGame() {
    joinGame(root.child('games').push().name())
}

function joinGame(id) {
    console.log('joinGame', id)

    var gameRef = root.child('games').child(id)
    gameRef.once('value', function(snapshot) {
        if (snapshot.val() === null) {
            // A game with this id hasn't been made yet, so we get to make it and be the host.
            startGame(root.child('games').child(id), 'host')
        } else {
            // Join the game.
            startGame(gameRef, gameRef.push().name())
        }
    })
}

// Get the initial game state and add ourselves to it.
function initPlayer(gameRef, us, doneCallback) {
    gameRef.once('value', function(snapshot) {
        var state = snapshot.val()
        if (state === null)
            state = {}

        // Determine what our color should be.
        var colors = ['blue', 'red', 'green', 'purple', 'yellow', 'magenta', 'cyan']
        var numColors = colors.length
        var numPlayers = 0
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                numPlayers += 1

                var index = colors.indexOf(state[player].color)
                if (index >= 0)
                    delete colors[index]
            }
        }
        console.log('numPlayers', numPlayers)

        // TODO: Determining if there are too many players should be done in a
        // transaction, in case multiple players join at the same time.
        if (numPlayers >= numColors) {
            console.log("Too many players in game to join.")
            return
        }

        // Find the first color that wasn't deleted.
        for (i in colors) {
            if (colors.hasOwnProperty(i)) {
                var color = colors[i]
                break
            }
        }
        console.log('color', color)

        state[us] = {
            x: width / 2, y: height / 2,
            dx: 0, dy: 0,
            color: color
        }

        console.log('state', state)

        doneCallback(state)
    })
}

// gameRef is a Firebase reference to the game state, and us is a string
// containing our player id. gameRef.child(id) will hold our current state.
function startGame(gameRef, us) {
    console.log('startGame', gameRef.toString(), us)

    initPlayer(gameRef, us, function(state) {
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
                    with (state[player]) {
                        // Move player.
                        x += dx
                        y += dy

                        // Slow player down a little bit over time.
                        dx *= drag
                        dy *= drag

                        // Keep player in bounds by making them bounce off walls,
                        // reducing their speed a little bit.
                        if (x > width) dx = -Math.abs(dx) * friction
                        if (x < 0) dx = Math.abs(dx) * friction
                        if (y > height) dy = -Math.abs(dy) * friction
                        if (y < 0) dy = Math.abs(dy) * friction

                        // Draw player.
                        g.fillStyle = color
                        g.fillRect(x, y, size, size)
                    }
                }
            }

            // Collision detection. The only actual privilege that the host
            // has is that they are the only one that does collision handling.
            if (us === 'host') {
                // For every pair of players:
                for (player in state) {
                    if (state.hasOwnProperty(player)) {
                        for (otherPlayer in state) {
                            if (state.hasOwnProperty(otherPlayer) && player !== otherPlayer) {
                                var p = state[player], o = state[otherPlayer]
                                if (p.x < o.x + size && p.x + size > o.x &&
                                    p.y < o.y + size && p.y + size > o.y) {
                                    // Crazy/stupid collision handling!
                                    var k = 1 + 2*Math.random()
                                    p.dx *= -k; p.dy *= -k
                                    o.dx *= -k; o.dy *= -k

                                    // Immediately publish states when two players collide.
                                    gameRef.child(player).set(state[player])
                                    gameRef.child(otherPlayer).set(state[otherPlayer])
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
                ourState = state[us]
                state = snapshot.val()
                state[us] = ourState
            }
        })

        window.onunload = function(e) {
            gameRef.child(us).remove()
        }

        setInterval(function() { console.log('state', state) }, 10 * 1000)

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
