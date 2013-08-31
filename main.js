var root = new Firebase('ssspppaaaccceee.firebaseio.com')

var width = 640, height = 480;
var size = 10
var k = 1000
var drag = 0.99
var friction = 0.5
var boost = 5

var canvas = document.getElementById('canvas')
canvas.width = width;
canvas.height = height;
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
        var numPlayers = 0
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                numPlayers += 1
            }
        }
        console.log('numPlayers', numPlayers)

        // TODO: Determining if there are too many players should be done in a
        // transaction, in case multiple players join at the same time.
        if (numPlayers >= colors.length) {
            console.log("Too many players in game to join.")
            return
        }

        console.log('color', colors[numPlayers])

        state[us] = {
            x: width / 2, y: height / 2,
            dx: 0, dy: 0,
            color: colors[numPlayers]
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
            our = state[us]

            // Move ourself towards the mouse in proportion to how far away they
            // are from the mouse (the farther we are from the mouse, the faster we
            // move towards it).
            our.dx += (mouseX - our.x) / k
            our.dy += (mouseY - our.y) / k

            // Clear screen.
            g.fillStyle = '#000'
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
                                    // Crazy stuff!
                                    state[player].dx *= -(1 + Math.random())
                                    state[player].dy *= -(1 + Math.random())
                                    state[otherPlayer].dx *= -(1 + Math.random())
                                    state[otherPlayer].dy *= -(1 + Math.random())

                                    // Immediately publish states when two players collide.
                                    gameRef.child(player).set(state[player])
                                    gameRef.child(otherPlayer).set(state[otherPlayer])
                                }
                            }
                        }
                    }
                }
            }
        }, 1000 / 60)

        setInterval(function() {
            // Publish our current state every once in a while so that other
            // players can see it.
            gameRef.child(us).set(state[us])
        }, 100)

        // When the other players publish their states, copy it into our state.
        gameRef.on('value', function(snapshot) {
            if (snapshot.val() !== null) {
                ourState = state[us]
                state = snapshot.val()
                state[us] = ourState
            }

            // If the host disappeared, try to become the host.
            if (!state.hasOwnProperty('host')) {
                console.log('host disappeared', state)

                gameRef.transaction(function(newState) {
                    newState['host'] = us
                    delete newState[us]
                }, function(error, committed, snapshot) {
                    if (!error && committed) {
                        console.log('became host')
                        us = 'host'
                    } else {
                        console.log('error', error, 'committed', committed, 'snapshot', snapshot.val())
                    }
                })
            }
        })

        window.onunload = function(e) {
            // TODO: Make into a transaction.
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

/*function client(gameRef) {
    var lastStateTime = Date.now()
    var total = 0, count = 0
    gameRef.child('state').on('value', function(snapshot) {
        var currentTime = Date.now()
        total += currentTime - lastStateTime
        count += 1
        console.log('current', currentTime - lastStateTime, 'average', total / count)

        var state = snapshot.val()

        // Clear screen.
        g.fillStyle = '#000'
        g.fillRect(0, 0, width, height)

        // Draw players.
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                var p = state[player]
                g.fillStyle = p.color
                g.fillRect(p.x - size, p.y - size, size, size)
            }
        }

        lastStateTime = currentTime
    })

    var input = gameRef.child('clientInput')
    canvas.onmousemove = function(e) {
        var mouseX = e.pageX - canvas.offsetLeft
        var mouseY = e.pageY - canvas.offsetTop
        input.set({type: 'mousemove', x: mouseX, y: mouseY})
    }
    canvas.onmousedown = function(e) {
        input.set({type: 'mousedown', down: true})
    }
    canvas.onmousedown = function(e) {
        input.set({type: 'mousedown', down: false})
    }
    canvas.onkeypress = function(e) {
        var key = String.fromCharCode(e.which)
        if (['w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].indexOf(key) >= 0)
            input.set({type: 'keypress', key: key})
    }
}*/
