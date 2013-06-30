
// http://codeflow.org/entries/2010/aug/28/integration-by-example-euler-vs-verlet-vs-runge-kutta/helper.js 
var Vec = function(x, y){
    this.x = x;
    this.y = y;
}

function vectorForAngle(angle, magnitude) {
    return new Vec(magnitude * Math.cos(angle), -magnitude * Math.sin(angle));
}

Vec.prototype = {
    isub: function(other){
        this.x -= other.x;
        this.y -= other.y;
        return this;
    },
    sub: function(other){
        return new Vec(
            this.x - other.x,
            this.y - other.y
        );
    },
    iadd: function(other){
        this.x += other.x;
        this.y += other.y;
        return this;
    },
    add: function(other){
        return new Vec(
            this.x + other.x,
            this.y + other.y
        );
    },

    imul: function(scalar){
        this.x *= scalar;
        this.y *= scalar;
        return this;
    },
    mul: function(scalar){
        return new Vec(
            this.x * scalar,
            this.y * scalar
        )
    },
    idiv: function(scalar){
        this.x /= scalar;
        this.y /= scalar;
        return this;
    },
    div: function(scalar){
        return new Vec(
            this.x / scalar,
            this.y / scalar
        )
    },

    normalized: function(){
        var x=this.x, y=this.y;
        var length = Math.sqrt(x*x + y*y)
        return new Vec(x/length, y/length);
    },
    normalize: function(){
        var x=this.x, y=this.y;
        var length = Math.sqrt(x*x + y*y)
        this.x = x/length;
        this.y = y/length;
        return this;
    },

    length: function(){
        return Math.sqrt(this.x*this.x + this.y*this.y);
    },

    distance: function(other){
        var x = this.x - other.x;
        var y = this.y - other.y;
        return Math.sqrt(x*x + y*y);
    },

    copy: function(){
        return new Vec(this.x, this.y);
    },
    
    iset: function(other) {
        this.x = other.x;
        this.y = other.y;
    }
}

var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	game = createGame();
	
io.set('log level', 2);

app.use(express.static(__dirname + '/public'));

game.initialize(io);

server.listen(8888);

function createGame() {
	var ships = [];
	var asteroids = [];
	var bullets = [];
	var updatesPerSecond = 10;
	var stepsPerUpdate = 2;
	var maxSpeed = 50;
    var universeSize = 200;
	var nextId = 0;
    var center = new Vec(universeSize / 2, universeSize / 2);
	var dt = 1 / updatesPerSecond;
    var G = 1000 / stepsPerUpdate;
	
	function update() {
		for (var s in ships) {
			var ship = ships[s];
			
			ship.oa = ship.a;
			ship.pp.iset(ship.p);
			ship.sc--;
			
			if (ship.shoot && ship.sc <= 0) {
				bullets.unshift({
                    p: ship.p.copy(),
                    pp: ship.pp.copy(),
                    v: vectorForAngle(ship.a, 8 / stepsPerUpdate).iadd(ship.v),
					l: 5 * updatesPerSecond, 
					sid: ship.id
				});
				ship.sc = updatesPerSecond / 5;
			}
		}
		
		for (var i in bullets) {
			var bullet = bullets[i];
			
			bullet.pp.iset(bullet.p);
		}
		
		for (var i in asteroids) {
			var asteroid = asteroids[i];
			asteroid.pp.iset(asteroid.p);
		}
		
		for (var i = 0; i < stepsPerUpdate; i++) {
			updateStep();
		}
	}
	
	function updateStep() {
		for (var s in ships) {
			var ship = ships[s];
			
            ship.a += ship.pturn == null ? ship.turn : ship.pturn;
            ship.pturn = null;
			
            var acc = acceleration(center, ship.p);
            if (ship.acc) {
                acc.iadd(new vectorForAngle(ship.a, 5 / stepsPerUpdate));
            }
			ship.v.iadd(acc.mul(dt));
			
            var speed = ship.v.length();
			if (speed > maxSpeed) {
                ship.v.imul(maxSpeed / speed);
			}
            
            ship.p.iadd(ship.v.mul(dt));
            
			while (ship.p.x < 0) { ship.p.x += universeSize; ship.pp.x += universeSize; }
            while (ship.p.x > universeSize) { ship.p.x -= universeSize; ship.pp.x -= universeSize; }
            while (ship.p.y < 0) { ship.p.y += universeSize; ship.pp.y += universeSize; }
            while (ship.p.y > universeSize) { ship.p.y -= universeSize; ship.pp.y -= universeSize; }
		}
		
		for (var i in bullets) {
			var bullet = bullets[i];
			
			if (bullet.l-- <= 0) {
				bullets.splice(i, bullets.length - i);
				break;
			}
		
			var acc = acceleration(center, bullet.p);
			bullet.v.iadd(acc.mul(dt));
			
			bullet.p.iadd(bullet.v.mul(dt));
							
			while (bullet.p.x < 0) { bullet.p.x += universeSize; bullet.pp.x += universeSize; }
			while (bullet.p.x > universeSize) { bullet.p.x -= universeSize; bullet.pp.x -= universeSize; }
			while (bullet.p.y < 0) { bullet.p.y += universeSize; bullet.pp.y += universeSize; }
			while (bullet.p.y > universeSize) { bullet.p.y -= universeSize; bullet.pp.y -= universeSize; }
		}
		
		for (var i in asteroids) {
			var asteroid = asteroids[i];
			
            var acc = acceleration(center, asteroid.p);
			asteroid.v.iadd(acc.mul(dt));
			
            asteroid.p.iadd(asteroid.v.mul(dt));
		}
		
		checkForCollisions()
		
		io.sockets.emit('up', { ships: ships, asteroids: asteroids, bullets: bullets });
	}
	
	function acceleration(a, b){
		var direction = a.sub(b);
		var length = direction.length();
		var normal = direction.normalized();
		return normal.mul(G/Math.pow(length, 2));
	};
	
	function checkForCollisions() {
		for (var i = bullets.length - 1; i >= 0; i--) {
			var bullet = bullets[i];
			var removeBullet = false;
			for (var j in asteroids) {
				var asteroid = asteroids[j];
				if (collision(bullet.pp, 0, asteroid.pp, asteroid.r)) {
					removeBullet = true;
				}
			}
			for (var j in ships) {
				var ship = ships[j];
				if (bullet.sid != ship.id && collision(bullet.pp, 0, ship.pp, .4)) {
					removeBullet = true;
					respawn(ship);
				}
			}
			if (removeBullet) {
				bullets.splice(i, 1);
			}
		}
		
		for (var i in ships) {
			var ship = ships[i];
			for (var j in asteroids) {
				var asteroid = asteroids[j];
				if (collision(ship.pp, .4, asteroid.pp, asteroid.r)) {
					respawn(ship);
				}
			}
			if (collision(ship.pp, .4, center, 10)) {
				respawn(ship);
			}
		}
	}
	
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
            p: new Vec(100, 50), // position
            pp: new Vec(100, 50), // previous position
			a: 0,   // angle (radians)
			oa: 0,  // old angle
            v: new Vec(-Math.sqrt(G / 50), 0), // velocity
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
	
	function respawn(ship) {
		var angle = Math.random() * Math.PI * 2;
		var position = center.add(vectorForAngle(angle, 60));
		ship.p = position;
		ship.pp = position.copy();
		ship.a = angle + Math.PI;
		ship.oa = ship.a;
		ship.v = vectorForAngle(angle + Math.PI / 2, Math.sqrt(G / 60))
	}
	
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
					ship.turn = (Math.PI / 10) * data / stepsPerUpdate;
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
