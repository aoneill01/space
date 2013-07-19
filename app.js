var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	v = require('./public/js/vector.js'),
	Vector = v.Vector,
	vectorForAngle = v.vectorForAngle;

// Prevent socket.io debug	
io.set('log level', 2);

// Host public files
app.use(express.static(__dirname + '/public'));

server.listen(8080);

function GameObject(position, velocity, radius) {
	this.position = position;
	this.velocity = velocity;
	this.radius = radius;
	this.id = GameObject.nextId++;
	this.precision = 6;
}

GameObject.nextId = 0;

GameObject.prototype.updatePosition	= function (additionalAcceleration) {
	var acc = new Vector(0, 0);
	for (var i in planets) {
        if (this == planets[i]) continue;
		acc.iadd(planets[i].gravitationalAcceleration(this));
	}
	if (additionalAcceleration) acc.iadd(additionalAcceleration);
	this.velocity.iadd(acc.mul(dt));
	this.position.iadd(this.velocity.mul(dt));
	
	// Wrap the object if needed
	while (this.position.x < 0) { this.position.x += universeSize; }
	while (this.position.x > universeSize) { this.position.x -= universeSize; }
	while (this.position.y < 0) { this.position.y += universeSize; }
	while (this.position.y > universeSize) { this.position.y -= universeSize; }
}

/**
Collision detection for bounding circles.
**/
function collision(object1, object2) {
	var collisionDistance = object1.radius + object2.radius;
	if (Math.abs(object1.position.x - object2.position.x) > collisionDistance
		|| Math.abs(object1.position.y - object2.position.y) > collisionDistance) {
		return false;
	}
	return Math.pow(object1.position.x - object2.position.x, 2) + Math.pow(object1.position.y - object2.position.y, 2) < collisionDistance * collisionDistance;
}

function Ship(position, velocity) {
	GameObject.call(this, position, velocity, .4);
	this.angle = 0;   // angle (radians)
	this.accelerating = false; // accelerate
	this.turn = 0; // turn angle
	this.prevTurn = null;
	this.shooting = false; // shooting
	this.shootCountdown = 0; // shoot countdown
}

Ship.prototype = new GameObject();
Ship.prototype.constructor = Ship;
Ship.prototype.toDto = function () {
	return {
		x: new Number(this.position.x).toPrecision(this.precision),
		y: new Number(this.position.y).toPrecision(this.precision),
		a: new Number(this.angle).toPrecision(this.precision),
		acc: this.accelerating,
		id: this.id
	};
}

Ship.prototype.respawn = function () {
	var angle = Math.random() * Math.PI * 2;
	this.position = planets[0].position.add(vectorForAngle(angle, 60));
	this.angle = angle + Math.PI;
	this.velocity = vectorForAngle(angle + Math.PI / 2, Math.sqrt(g * planets[0].mass / 60))
}

Ship.prototype.update = function () {
	this.angle += this.prevTurn == null ? this.turn : this.prevTurn;
	this.prevTurn = null;
	
	this.updatePosition(this.accelerating ? vectorForAngle(this.angle, 5) : new Vector(0, 0));
}
	
function Bullet(position, velocity, life, ship) {
	GameObject.call(this, position, velocity, 0);
	this.life = life;
	this.ship = ship;
}

Bullet.prototype = new GameObject();
Bullet.prototype.constructor = Bullet;
Bullet.prototype.toDto = function () {
	return {
		x: new Number(this.position.x).toPrecision(this.precision),
		y: new Number(this.position.y).toPrecision(this.precision),
		id: this.id
	};
}

function Asteroid(position, velocity, radius) {
	GameObject.call(this, position, velocity, radius);
}

Asteroid.prototype = new GameObject();
Asteroid.prototype.constructor = Asteroid;
Asteroid.prototype.toDto = function () {
	return {
		x: new Number(this.position.x).toPrecision(this.precision),
		y: new Number(this.position.y).toPrecision(this.precision),
		id: this.id,
		r: this.radius
	};
}

function Planet(position, velocity, radius) {
	GameObject.call(this, position, velocity, radius);
	this.mass = (4/3) * Math.PI * radius * radius * radius;
}

Planet.prototype = new GameObject();
Planet.prototype.constructor = Planet;
Planet.prototype.toDto = function () {
	return {
		x: new Number(this.position.x).toPrecision(this.precision),
		y: new Number(this.position.y).toPrecision(this.precision),
		id: this.id,
		r: this.radius
	};
}

Planet.prototype.gravitationalAcceleration = function (o){
	var direction = this.position.sub(o.position);
	var length = direction.length();
	var normal = direction.normalized();
	return normal.mul(g * this.mass / Math.pow(length, 2));
};

// Width and height of space
var universeSize = 200;
// Array of all the ships
var ships = [];
// Array of all the asteroids
var asteroids = [];
// Array of all the bullets
var bullets = [];
var planets = [new Planet(new Vector(universeSize / 2, universeSize / 2), new Vector(0, 0), 10)];
var updatesPerSecond = 10;
// Number of discrete physics calculations per update
var stepsPerUpdate = 4;
// Maximum speed for a ship
var maxSpeed = null;
// Change in time per update
var dt = 1 / (updatesPerSecond * stepsPerUpdate);
var g = .2;


/**
Periodic update of all objects.
**/
function update() {
	for (var s in ships) {
		var ship = ships[s];
		
		ship.shootCountdown--;
		
		// Update bullets
		if (ship.shooting && ship.shootCountdown <= 0) {
			bullets.unshift(new Bullet(ship.position.copy(), vectorForAngle(ship.angle, 7).iadd(ship.velocity), 5 * updatesPerSecond * stepsPerUpdate, ship));
			// Reset the shot counter
			ship.shootCountdown = updatesPerSecond / 5;
		}
	}
	
	// Perform the physics update
	for (var i = 0; i < stepsPerUpdate; i++) {
		updateStep();
	}
	
	// Notify clients of update
	emitUpdate();
}

function updateStep() {
	// Check for collisions
	checkForCollisions();
	
	// Update the ships
	for (var s in ships) {
		ships[s].update();
	}
	
	// Update the bullets
	for (var i in bullets) {
		var bullet = bullets[i];
		
		if (bullet.life-- <= 0) {
			bullets.splice(i, bullets.length - i);
			break;
		}
	
		bullet.updatePosition(new Vector(0, 0));
	}
	
	// Update the asteroids
	for (var i in asteroids) {
		asteroids[i].updatePosition(new Vector(0, 0));
	}
    
    for (var i = 0; i < planets.length; i++) {
        planets[i].updatePosition(new Vector(0, 0));
    }
}

function checkForCollisions() {
	// Check for bullet collisions
	for (var i = bullets.length - 1; i >= 0; i--) {
		var bullet = bullets[i];
		var removeBullet = false;
		var splitAsteroid = null;
		for (var j in asteroids) {
			var asteroid = asteroids[j];
			if (collision(bullet, asteroid)) {
				removeBullet = true;
				splitAsteroid = j;
			}
		}
		for (var j in ships) {
			var ship = ships[j];
			if (bullet.ship != ship && collision(bullet, ship)) {
				removeBullet = true;
				ship.respawn();
			}
		}
		for (var j in planets) {
			if (collision(bullet, planets[j])) {
				removeBullet = true;
			}
		}
		
		if (removeBullet) {
			bullets.splice(i, 1);
		}
		if (splitAsteroid) {
			var asteroid = asteroids[splitAsteroid];
			if (asteroid.radius < .4) {
				asteroids.splice(splitAsteroid, 1);
			}
			else {
				var v = vectorForAngle(Math.random()*2*Math.PI, 3 * Math.random());
				asteroids.push(new Asteroid(asteroid.position.copy(), asteroid.velocity.add(v), asteroid.radius* (2/3)));
				v = vectorForAngle(Math.random()*2*Math.PI, Math.random());
				asteroid.velocity.iadd(v);
				asteroid.radius *= (2/3);
			}
		}
	}
	
	// Check for ships running into things
	for (var i in ships) {
		var ship = ships[i];
		for (var j in asteroids) {
			var asteroid = asteroids[j];
			if (collision(ship, asteroid)) {
				ship.respawn();
			}
		}
		for (var j in planets) {
			if (collision(ship, planets[j])) {
				ship.respawn()
			}
		}
	}
	
	for (var i in asteroids) {
		var asteroid = asteroids[i];
		for (var j in planets) {
			if (collision(asteroid, planets[j])) {
				asteroids.splice(i, 1);
			}
		}
	}
}

function join() {
	var ship = new Ship(new Vector(0, 0), new Vector(0, 0));
	ship.respawn();
	ships.push(ship);
	return ship;
}

/**
Adds a randomly generated asteroid in circular orbit.
**/
function addAsteroid() {
	var radius = Math.random() * 10 + 35;
	var angle = Math.random() * Math.PI * 2;
	var size = Math.random() * 1 + .25;
	var position = planets[0].position.add(vectorForAngle(angle, radius));
	asteroids.push(new Asteroid(position, vectorForAngle(angle + Math.PI / 2, Math.sqrt(g * planets[0].mass / radius)), size));
}

function addPlanet() {
	var radius = Math.random() * 10 + 70;
	var angle = Math.random() * Math.PI * 2;
	var size = Math.random() * 4 + 1;
	var position = planets[0].position.add(vectorForAngle(angle, radius));
	planets.push(new Planet(position, vectorForAngle(angle + Math.PI / 2, Math.sqrt(g * planets[0].mass / radius)), size));
}

function emitUpdate() {
	var precision = 6;
	var emitShips = [];
	for (var i in ships) {
		emitShips[i] = ships[i].toDto();
	}
	var emitBullets = [];
	for (var i in bullets) {
		emitBullets[i] = bullets[i].toDto();
	}
	var emitAsteroids = [];
	for (var i in asteroids) {
		emitAsteroids[i] = asteroids[i].toDto();
	}
	var emitPlanets = [];
	for (var i in planets) {
		emitPlanets[i] = planets[i].toDto();
	}
	io.sockets.volatile.emit('up', { ships: emitShips, asteroids: emitAsteroids, bullets: emitBullets, planets: emitPlanets });
}


io.sockets.on('connection', function (socket) {
	var ship = join();
	socket.emit('id', ship.id);
	socket.on('dir', function (data) {
		ship.prevTurn = ship.turn;
		ship.turn = .5 * (2 * Math.PI) * data * (1 / (updatesPerSecond * stepsPerUpdate));
	});
	socket.on('acc', function (data) {
		ship.accelerating = data;
	});
	socket.on('shoot', function (data) {
		ship.shooting = data;
	});
	socket.on('disconnect', function () {
		ships.splice(ships.indexOf(ship), 1);
	});
});

for (var i = 0; i < 100; i++) {
	addAsteroid();
}

for (var i = 0; i < 1; i++) {
    addPlanet();
}

setInterval(update, 1000 / updatesPerSecond);
