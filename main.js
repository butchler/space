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

function joinGame() {
    var gameRef, us
    root.child('waiting').transaction(function(gameUrl) {
        if (gameUrl === null) {
            // There is nobody waiting, so create a game and tell everybody
            // that we're waiting.
            root.child('games').remove()   // Temporary for development purposes.
            gameRef = root.child('games').push()
            newGameUrl = gameRef.toString()
            us = 'player1'

            return newGameUrl
        } else {
            // There's somebody waiting, so join their game.
            gameRef = new Firebase(gameUrl)
            us = 'player2'

            return null
        }
    },
    function(error, committed, snapshot) {
        if (!error && committed) {
            var them = us === 'player1' ? 'player2' : 'player1'
            console.log(gameRef, us, them)
            startGame(gameRef, us, them)
        } else {
            console.log('error', error, 'committed', committed, 'snapshot', snapshot)
        }
    })
}

function startGame(gameRef, us, them) {
    // Initial state.
    var state = {
        player1: {x: width / 2, y: height / 2, dx: 0, dy: 0, color: '#00f'},
        player2: {x: width / 4, y: height / 4, dx: 0, dy: 0, color: '#f00'}
    }
    var mouseX = width / 2, mouseY = height / 2

    setInterval(function() {
        // Move ourself towards the mouse in proportion to how far away they
        // are from the mouse (the farther we are from the mouse, the faster we
        // move towards it).
        state[us].dx += (mouseX - state[us].x) / k
        state[us].dy += (mouseY - state[us].y) / k

        // Clear screen.
        g.fillStyle = '#000'
        g.fillRect(0, 0, width, height)

        // For each player:
        for (player in state) {
            if (state.hasOwnProperty(player)) {
                with (state[player]) {
                    // Slow player down a little bit over time.
                    dx *= drag
                    dy *= drag

                    // Move player.
                    x += dx
                    y += dy

                    // TODO: collision detection.

                    // Keep player in bounds by making them bounce off walls,
                    // reducing their speed a little bit.
                    if (x > width) dx = -Math.abs(dx) * friction
                    if (x < 0) dx = Math.abs(dx) * friction
                    if (y > height) dy = -Math.abs(dy) * friction
                    if (y < 0) dy = Math.abs(dy) * friction

                    // Draw player.
                    g.fillStyle = color
                    g.fillRect(x - size, y - size, size, size)
                }
            }
        }
    }, 1000 / 60)

    setInterval(function() {
        // Publish our current state every once in a while so that other player
        // can see it.
        gameRef.child(us).set(state[us])
    }, 100)

    // When the other player publishes their state, copy it into our state.
    gameRef.child(them).on('value', function(snapshot) {
        if (snapshot.val() !== null)
            state[them] = snapshot.val()
    })

    /*if (us == 'player2') {
        gameRef.child(us).on('value', function(snapshot) {
            if (snapshot.val() !== null)
                state[us] = snapshot.val()
        })
    }*/

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
