var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	v = require('./public/js/vector.js'),
	Vector = v.Vector,
	vectorForAngle = v.vectorForAngle,
	game = createGame();

// Prevent socket.io debug	
io.set('log level', 2);

// Host public files
app.use(express.static(__dirname + '/public'));

// Initialize the game
game.initialize(io);

server.listen(8888);

function createGame() {
	// Array of all the ships
	var ships = [];
	// Array of all the asteroids
	var asteroids = [];
	// Array of all the bullets
	var bullets = [];
	var updatesPerSecond = 10;
	// Number of discrete physics calculations per update
	var stepsPerUpdate = 4;
	// Maximum speed for a ship
	var maxSpeed = 50;
	// Width and height of space
    var universeSize = 200;
	// New ship identifier
	var nextId = 0;
	// Center of space and location of sun
    var center = new Vector(universeSize / 2, universeSize / 2);
	// Change in time per update
	var dt = 1 / (updatesPerSecond * stepsPerUpdate);
	// Constant for sun gravity
    var G = 1000;
	
	/**
	Periodic update of all objects.
	**/
	function update() {
		for (var s in ships) {
			var ship = ships[s];
			
			// Record the previous angle and position
			ship.oa = ship.a;
			ship.pp.iset(ship.p);
			ship.sc--;
			
			// Update bullets
			if (ship.shoot && ship.sc <= 0) {
				bullets.unshift({
                    p: ship.p.copy(),
                    pp: ship.pp.copy(),
                    v: vectorForAngle(ship.a, 10).iadd(ship.v),
					l: 5 * updatesPerSecond * stepsPerUpdate, 
					sid: ship.id
				});
				// Reset the shot counter
				ship.sc = updatesPerSecond / 5;
			}
		}
		
		// Record the previous position of bullets
		for (var i in bullets) {
			var bullet = bullets[i];
			bullet.pp.iset(bullet.p);
		}
		
		// Record the previous position of asteroids
		for (var i in asteroids) {
			var asteroid = asteroids[i];
			asteroid.pp.iset(asteroid.p);
		}
		
		// Perform the physics update
		for (var i = 0; i < stepsPerUpdate; i++) {
			updateStep();
		}
		
		// Notify clients of update
		io.sockets.emit('up', { ships: ships, asteroids: asteroids, bullets: bullets });
	}
	
	function updateStep() {
		// Check for collisions
		checkForCollisions();
		
		// Update the ships
		for (var s in ships) {
			var ship = ships[s];
			
            ship.a += ship.pturn == null ? ship.turn : ship.pturn;
            ship.pturn = null;
			
			updatePosition(ship, ship.acc ? vectorForAngle(ship.a, 10) : new Vector(0, 0), maxSpeed);
   		}
		
		// Update the bullets
		for (var i in bullets) {
			var bullet = bullets[i];
			
			if (bullet.l-- <= 0) {
				bullets.splice(i, bullets.length - i);
				break;
			}
		
			updatePosition(bullet);
		}
		
		// Update the asteroids
		for (var i in asteroids) {
			updatePosition(asteroids[i]);
		}	
	}
	
	function updatePosition(object, additionalAcceleration, maxSpeed) {
		var acc = gravitationalAcceleration(center, object.p)
		if (additionalAcceleration) acc.iadd(additionalAcceleration);
		object.v.iadd(acc.mul(dt));
		if (maxSpeed && object.v.length() > maxSpeed) {
			object.v.imul(maxSpeed / object.v.length());
		}
		object.p.iadd(object.v.mul(dt));
		
		// Wrap the object if needed
		while (object.p.x < 0) { object.p.x += universeSize; object.pp.x += universeSize; }
		while (object.p.x > universeSize) { object.p.x -= universeSize; object.pp.x -= universeSize; }
		while (object.p.y < 0) { object.p.y += universeSize; object.pp.y += universeSize; }
		while (object.p.y > universeSize) { object.p.y -= universeSize; object.pp.y -= universeSize; }
	}
	
	function gravitationalAcceleration(a, b){
		var direction = a.sub(b);
		var length = direction.length();
		var normal = direction.normalized();
		return normal.mul(G/Math.pow(length, 2));
	};
	
	function checkForCollisions() {
		// Check for bullet collisions
		for (var i = bullets.length - 1; i >= 0; i--) {
			var bullet = bullets[i];
			var removeBullet = false;
			for (var j in asteroids) {
				var asteroid = asteroids[j];
				if (collision(bullet.p, 0, asteroid.p, asteroid.r)) {
					removeBullet = true;
				}
			}
			for (var j in ships) {
				var ship = ships[j];
				if (bullet.sid != ship.id && collision(bullet.p, 0, ship.p, .4)) {
					removeBullet = true;
					respawn(ship);
				}
			}
			if (collision(bullet.p, 0, center, 10)) {
				removeBullet = true;
			}
			if (removeBullet) {
				bullets.splice(i, 1);
			}
		}
		
		// Check for ships running into things
		for (var i in ships) {
			var ship = ships[i];
			for (var j in asteroids) {
				var asteroid = asteroids[j];
				if (collision(ship.p, .4, asteroid.p, asteroid.r)) {
					respawn(ship);
				}
			}
			if (collision(ship.p, .4, center, 10)) {
				respawn(ship);
			}
		}
	}
	
	/**
	Collision detection for bounding circles.
	**/
	function collision(point1, radius1, point2, radius2) {
		var collisionDistance = radius1 + radius2;
		if (Math.abs(point1.x - point2.x) > collisionDistance
			|| Math.abs(point1.y - point2.y) > collisionDistance) {
			return false;
		}
		return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)) < collisionDistance;
	}
	
	function join() {
		var ship = { 
            p: new Vector(100, 50), // position
            pp: new Vector(100, 50), // previous position
			a: 0,   // angle (radians)
			oa: 0,  // old angle
            v: new Vector(-Math.sqrt(G / 50), 0), // velocity
			acc: false, // accelerate
			bullets: [],
			turn: 0, // turn angle
			pturn: null,
			shoot: false, // shooting
			id: nextId++,
			sc: 0 // shoot countdown
		};
		respawn(ship);
		ships.push(ship);
		return ship;
	}
	
	/**
	Respawn the ship at a new location.
	**/
	function respawn(ship) {
		var angle = Math.random() * Math.PI * 2;
		var position = center.add(vectorForAngle(angle, 60));
		ship.p = position;
		ship.pp = position.copy();
		ship.a = angle + Math.PI;
		ship.oa = ship.a;
		ship.v = vectorForAngle(angle + Math.PI / 2, Math.sqrt(G / 60))
	}
	
	/**
	Adds a randomly generated asteroid in circular orbit.
	**/
	function addAsteroid() {
		var radius = Math.random() * 10 + 45;
		var angle = Math.random() * Math.PI * 2;
		var size = Math.random() * .5 + .25;
		var position = center.add(vectorForAngle(angle, radius));
		asteroids.push({
			p: position,
			pp: position.copy(),
			v: vectorForAngle(angle + Math.PI / 2, Math.sqrt(G / radius)),
			r: size
		});
	}
	
	return {
		initialize: function (io) {
			io.sockets.on('connection', function (socket) {
				var ship = join();
				socket.emit('id', ship.id);
				socket.on('dir', function (data) {
					ship.pturn = ship.turn;
					ship.turn = .75 * (2 * Math.PI) * data * (1 / (updatesPerSecond * stepsPerUpdate));
				});
				socket.on('acc', function (data) {
					ship.acc = data;
				});
				socket.on('shoot', function (data) {
					ship.shoot = data;
				});
				socket.on('disconnect', function () {
					ships.splice(ships.indexOf(ship), 1);
				});
			});
			
			for (var i = 0; i < 100; i++) {
				addAsteroid();
			}
			
			setInterval(update, 1000 / updatesPerSecond);
		}
	};
}
