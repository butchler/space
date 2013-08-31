var root = new Firebase('ssspppaaaccceee.firebaseio.com')

var width = 640, height = 480;
var size = 10

var canvas = document.getElementById('canvas')
canvas.width = width;
canvas.height = height;
var g = canvas.getContext('2d')

function joinGame() {
    var gameRef, isServer
    root.child('waiting').transaction(function(gameUrl) {
        if (gameUrl === null) {
            // There is nobody waiting, so create a game and tell everybody
            // that we're waiting.
            root.child('games').remove()   // Temporary for development purposes.
            gameRef = root.child('games').push()
            newGameUrl = gameRef.toString()
            isServer = true

            return newGameUrl
        } else {
            // There's somebody waiting, so join their game.
            gameRef = new Firebase(gameUrl)
            isServer = false

            return null
        }
    },
    function(error, committed, snapshot) {
        if (!error && committed) {
            console.log('server', isServer)
            if (isServer)
                server(gameRef)
            else
                client(gameRef)
        }
    })

    // TODO: Should probably be a transaction.
    /*root.child('waiting').once('value', function(snapshot) {
        if (snapshot.val() === null) {
            var gameRef = root.child('games').push()
            root.child('waiting').set(gameRef.toString())

            server(gameRef)
        } else {
            var gameRef = root.child('games').child(snapshot.val())
            root.child('waiting').remove()

            client(gameRef)
        }
    })*/
}

/*function server(gameRef) {
    var width = 640, height = 480;
    var size = 10
    var k = 1000
    var drag = 0.99
    var friction = 0.5

    var canvas = document.getElementById('canvas')
    canvas.width = width;
    canvas.height = height;
    var g = canvas.getContext('2d')

    var x = width / 2, y = width / 2, dx = 0, dy = 0, mouseX = x, mouseY = y, mouseDown = false
    setInterval(function() {
        if (true || mouseDown) {
            dx += (mouseX - x) / k
            dy += (mouseY - y) / k
        }

        dx *= drag
        dy *= drag

        x += dx
        y += dy

        if (x > width) dx = -Math.abs(dx) * friction
        if (x < 0) dx = Math.abs(dx) * friction
        if (y > height) dy = -Math.abs(dy) * friction
        if (y < 0) dy = Math.abs(dy) * friction

        g.fillStyle = '#000'
        g.fillRect(0, 0, width, height)
        g.fillStyle = '#f00'
        g.fillRect(x - size, y - size, size, size)
    }, 1000 / 60)

    canvas.onmousemove = function(e) {
        mouseX = e.pageX - canvas.offsetLeft
        mouseY = e.pageY - canvas.offsetTop
    }
    canvas.onmousedown = function(e) { mouseDown = true }
    canvas.onmouseup = function(e) { mouseDown = false }
    document.onkeypress = function(e) {
        var key = String.fromCharCode(e.which)
        var boost = 5
        if (key === "w" || key === "W")
            dy = -boost
        else if (key === "a" || key === "A")
            dx = -boost
        else if (key === "s" || key === "S")
            dy = boost
        else if (key === "d" || key === "D")
            dx = boost
    }
}*/

function server(gameRef) {
    gameRef.child('state').set({
        client: {x: width / 4, y: height / 4, color: '#f00'},
        server: {x: width / 2, y: height / 2, color: '#00f'}
    })

    var k = 1000
    var drag = 0.99
    var friction = 0.5
    var x = width / 2, y = width / 2
    var dx = 0, dy = 0
    var mouseX = x, mouseY = y, mouseDown = false
    setInterval(function() {
        if (true || mouseDown) {
            dx += (mouseX - x) / k
            dy += (mouseY - y) / k
        }

        dx *= drag
        dy *= drag

        x += dx
        y += dy

        if (x > width) dx = -Math.abs(dx) * friction
        if (x < 0) dx = Math.abs(dx) * friction
        if (y > height) dy = -Math.abs(dy) * friction
        if (y < 0) dy = Math.abs(dy) * friction

        // Clear screen.
        g.fillStyle = '#000'
        g.fillRect(0, 0, width, height)

        // Draw player.
        g.fillStyle = '#000'
        g.fillRect(0, 0, width, height)
        g.fillStyle = '#f00'
        g.fillRect(x - size, y - size, size, size)

        // Send updated state.
        gameRef.child('state').child('server').set({
            x: x, y: y, color: '#00f'
        })
    }, 1000 / 60)

    canvas.onmousemove = function(e) {
        mouseX = e.pageX - canvas.offsetLeft
        mouseY = e.pageY - canvas.offsetTop
    }
    canvas.onmousedown = function(e) { mouseDown = true }
    canvas.onmouseup = function(e) { mouseDown = false }
    document.onkeypress = function(e) {
        var key = String.fromCharCode(e.which)
        var boost = 5
        if (key === "w" || key === "W")
            dy = -boost
        else if (key === "a" || key === "A")
            dx = -boost
        else if (key === "s" || key === "S")
            dy = boost
        else if (key === "d" || key === "D")
            dx = boost
    }
}

function client(gameRef) {
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
}
