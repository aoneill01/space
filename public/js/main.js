"use strict";

var Game = (function() {
	var context;
	var ships = [];
	var previousShips = [];
	var asteroids = [];
	var previousAsteroids = [];
	var bullets = [];
	var previousBullets = [];
	var lastUpdate;
	var start = new Date().getTime();
	var particles = [];
	var updatesPerSecond = 10;
    var stars = [];
    var universeSize = 200;
    var centerPosition = new Vector(universeSize / 2, universeSize / 2);
	var id;
	var randomList = [];
	var zoom = 2;
	var shipImg = new Image();
	
	/**
	Initializes the game.
	**/
	function initialize(socket) {
		context = document.getElementById("viewport").getContext("2d");
		window.onEachFrame(draw);
		socket.on('id', function (data) { id = data; });
		socket.on('up', update);
		bindKeys(socket);
        for (var i = 0; i < 100; i++) {
            stars.push(new Vector(25 * Math.random(), 25 * Math.random()));
        }
		for (var i = 0; i < 101; i++) {
			randomList[i] = Math.random();
		}
		shipImg.src = "../img/ship.png";
	}
	
	/**
	Attaches listeners for keypresses.
	**/
	function bindKeys(socket) {
		var left = false;
		var right = false;
		
		function direction() {
			if (left && right || !(left || right)) return 0;
			if (left) return 1;
			return -1;
		}
		
		var keysToAction = {
			17: function (down) { socket.emit('shoot', down); },
			37: function (down) { left = down; socket.emit('dir', direction()); },
			39: function (down) { right = down; socket.emit('dir', direction()); },
			38: function (down) { socket.emit('acc', down); },
			90: function (down) { if (down) zoom = zoom == 2 ? 1 : 2; }
		};
		
		$(document).keydown(function (event) {
			var action = keysToAction[event.which];
			if (action) {
				action(true);
				event.preventDefault();
			}
		});
		
		$(document).keyup(function (event) {
			var action = keysToAction[event.which];
			if (action) {
				action(false);
				event.preventDefault();
			}
		});
	}

	/**
	Draws the scene.
	**/
	function draw() {
		var width = context.canvas.width;
		var height = context.canvas.height;
		var factor = (width / 16) / zoom;
		var now = new Date().getTime();
		var interpolation = (now - lastUpdate) / (1000 / updatesPerSecond);
        
		context.fillStyle = 'black';
		context.fillRect(0, 0, width, height);
		
		if (id && ships[id] && previousShips[id]) {
		    var previousPosition = new Vector(previousShips[id].x, previousShips[id].y);
            var currentPosition = new Vector(ships[id].x, ships[id].y);
            var shipPosition = previousPosition.add(currentPosition.sub(previousPosition).mul(interpolation));
			
            drawStars(shipPosition, factor);

			drawBullets(shipPosition, interpolation, factor);
            
            drawSun(shipPosition, factor);
            
            drawAsteroids(shipPosition, interpolation, factor, now);			
            
			drawShips(shipPosition, interpolation, factor, now);
		}
		
		drawMap(zoom * factor);
	}
	
	function drawShips(mainShipPosition, interpolation, factor, now) {
		for (var s in ships) {
			if (isVisible(ships[s], mainShipPosition)) {
				drawShip(mainShipPosition, ships[s], previousShips[s] || {}, interpolation, factor, now);
			}
		}
	}
	
	function drawShip(mainShipPosition, ship, previousShip, interpolation, factor, now)
	{
        var previousPosition = new Vector(previousShip.x, previousShip.y);
        var currentPosition = new Vector(ship.x, ship.y);
        var shipPosition = previousPosition.add(currentPosition.sub(previousPosition).mul(interpolation));
		var a = previousShip.a + interpolation * (ship.a - previousShip.a);
        
        var translated = translatedPoint(shipPosition, mainShipPosition);
		
		context.save();
		context.translate(factor * translated.x, factor * translated.y);
		context.scale(.4 * factor / 64, .4 * factor / 64);
		context.rotate(-a - Math.PI / 2);
		context.drawImage(shipImg, -64, -64);
		context.restore();
				
		context.save();
		/*
        context.strokeStyle = 'white';
        context.fillStyle = 'black';
        context.lineWidth = 1;

		context.beginPath();
		var point = angularPoint(translated, a, .4);
		context.moveTo(factor * point.x, factor * point.y);
		point = angularPoint(translated, a - 2 / 3 * Math.PI, .2);
		context.lineTo(factor * point.x, factor * point.y);
		point = angularPoint(translated, a, .1);
		context.lineTo(factor * point.x, factor * point.y);
		point = angularPoint(translated, a + 2 / 3 * Math.PI, .2);
		context.lineTo(factor * point.x, factor * point.y);
		
        context.fill();
        context.closePath();
		context.stroke();
		*/
		var basePosition = angularPoint(shipPosition, a, -.4);
		
		context.globalCompositeOperation = 'lighter';
		for (var i in particles) {
			if (particles[i].ship != ship.id) continue;
            var elapsed = now - particles[i].t;
			var percentComplete = elapsed / 1000;
			var particlePoint = angularPoint(basePosition, particles[i].a, percentComplete * particles[i].v);
            var radius = (1 - percentComplete) * particles[i].r;
            if (radius <= 0) radius = .01;
            var h = Math.floor(150 + 300 * percentComplete) % 360;
            var l = Math.floor(90 - 40 * percentComplete);
            var a = .5 - .5 * percentComplete;
            translated = translatedPoint(particlePoint, mainShipPosition);
			
			context.beginPath();
			var rad = context.createRadialGradient(factor * translated.x, factor * translated.y, 1, factor * translated.x, factor * translated.y, factor * radius);
			rad.addColorStop(0, 'hsla(' + h + ', 100%, ' + l + '%, ' + a + ')');
			rad.addColorStop(1, 'hsla(' + h + ', 100%, ' + l + '%, 0)');
			context.fillStyle = rad;
            context.arc(factor * translated.x, factor * translated.y, factor * radius, 0, 2 * Math.PI, true);
            context.fill();
		}
        
		context.restore();
		
		
	}
	
	function drawAsteroids(mainShipPosition, interpolation, factor, now)
	{
		context.save();
		context.strokeStyle = 'white';
        context.fillStyle = 'black';
		
		for (var a in asteroids) {
			var asteroid = asteroids[a];
			var previousAsteroid = previousAsteroids[a] || {};
			
			if (!isVisible(asteroid, mainShipPosition)) continue;
			
			var previousPosition = new Vector(previousAsteroid.x, previousAsteroid.y);
			var currentPosition = new Vector(asteroid.x, asteroid.y);
			var shipPosition = previousPosition.add(currentPosition.sub(previousPosition).mul(interpolation));
			var rotation = 2 * Math.PI * (random(a, 1) * 2 - 1) * ((now - start) / 5000);
			var translated = translatedPoint(shipPosition, mainShipPosition);
			
			context.beginPath();
			
			for (var i = 0; i < 9; i++) {
				var point = angularPoint(translated, rotation + 2 * Math.PI * (i / 9) + (Math.PI / 5) * random(a, 2 * i), asteroid.r + (asteroid.r / 3) * random(a, 2 * i + 1) - asteroid.r / 6);
				if (i == 0) {
					context.moveTo(factor * point.x, factor * point.y);
				}
				else {
					context.lineTo(factor * point.x, factor * point.y);
				}
			}
			context.closePath();
			context.fill();
			context.stroke();			
		}
		
		context.restore();
	}
	
	function drawBullets(mainShipPosition, interpolation, factor) {
		context.save();
        context.fillStyle = 'white';
        
		for (var i in bullets) {
			var bullet = bullets[i];
			var previousBullet = previousBullets[i] || {};
			if (!isVisible(bullet, mainShipPosition)) continue;
			var previousPosition = new Vector(previousBullet.x, previousBullet.y);
			var currentPosition = new Vector(bullet.x, bullet.y);
			var position = previousPosition.add(currentPosition.sub(previousPosition).mul(interpolation));
			var translated = translatedPoint(position, mainShipPosition);
			context.fillRect(factor * translated.x, factor * translated.y, Math.ceil(.04 * factor), Math.ceil(.04 * factor));
		}
		
		context.restore();
	}
    
    function drawStars(mainShipPosition, factor) {
        context.save();
        context.fillStyle = '#777';
        for (var i in stars) {
            var translated = translatedPoint(stars[i], mainShipPosition.div(4));
            context.fillRect(factor * xWrap(translated.x), factor * yWrap(translated.y), Math.ceil(.02 * factor), Math.ceil(.02 * factor));
            context.fillRect(factor * (xWrap(translated.x) + 25), factor * yWrap(translated.y), Math.ceil(.02 * factor), Math.ceil(.02 * factor));
        }
		context.fillStyle = '#333';
		for (var i in stars) {
            var translated = translatedPoint(stars[i], mainShipPosition.div(8));
            context.fillRect(factor * xWrap(translated.x), factor * yWrap(translated.y), Math.ceil(.02 * factor), Math.ceil(.02 * factor));
            context.fillRect(factor * (xWrap(translated.x) + 25), factor * yWrap(translated.y), Math.ceil(.02 * factor), Math.ceil(.02 * factor));
        }
        context.restore();
    }
    
    function drawSun(mainShipPosition, factor) {
        context.save();
		
		var translated = translatedPoint(centerPosition, mainShipPosition);
        
		context.beginPath();
		var rad = context.createRadialGradient(factor * translated.x, factor * translated.y, factor * 10, factor * translated.x, factor * translated.y, factor * 10.5);
		rad.addColorStop(0, 'rgba(255, 255, 255, 1)');
		rad.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.fillStyle = rad;
		context.arc(factor * translated.x, factor * translated.y, factor * 10.5, 0, 2 * Math.PI, true);
		context.fill();
		
		context.restore();
    }
	
	function drawMap(factor) {
		context.save();
		
		context.strokeStyle = 'white';
		context.fillStyle = 'black';
		
		context.beginPath();
		context.rect(factor * 14, factor * 7, factor * 2, factor * 2);
		context.fill();
		context.stroke();
		
		context.fillStyle = 'white';
		context.beginPath();
        context.arc(factor * (14 + (2 * ((universeSize / 2) / universeSize))), 
			factor * (7 + (2 * ((universeSize / 2) / universeSize))), 
			factor * (2 * (10 / universeSize)), 0, 2 * Math.PI, true);
        context.fill();
		
		for (var i in asteroids) {
			var asteroid = asteroids[i];
			context.fillStyle = 'blue';
			context.fillRect(factor * (14 + (2 * (asteroid.x / universeSize))), 
				factor * (7 + (2 * (asteroid.y / universeSize))), 
				Math.ceil(.02 * factor), 
				Math.ceil(.02 * factor));
		}
		
		for (var i in ships) {
			var ship = ships[i];
			context.fillStyle = ship.id == id ? 'white' : 'red';
			context.fillRect(factor * (14 + (2 * (ship.x / universeSize))), 
				factor * (7 + (2 * (ship.y / universeSize))), 
				Math.ceil(.02 * factor), 
				Math.ceil(.02 * factor));
		}
		
		context.restore();
	}
	
	function isVisible(object, mainShipPosition) {
		return Math.abs(object.x - mainShipPosition.x) < 17 && 
			Math.abs(object.y - mainShipPosition.y) < 10;
	}
	
	function random(seed, index) {
		return randomList[((seed + 1) * index) % 101];
	}
	
    function angularPoint(point, angle, distance) {
        return point.copy().iadd(vectorForAngle(angle, distance));
	}
    
    function translatedPoint(point, mainShipPosition) {
        return new Vector(point.x - mainShipPosition.x + 8 * zoom, point.y - mainShipPosition.y + 4.5 * zoom);
    }
	
	function xWrap(x) {
		while (x < 0) x += 25;
		while (x > 25) x -= 25;
		return x;
	}
	
	function yWrap(y) {
		while (y < 0) y += 25;
		while (y > 25) y -= 25;
		return y;
	}
    
	function update(data) {
		previousShips = ships;
		ships = [];
		for (var i in data.ships) {
			var ship = data.ships[i];
			ships[ship.id] = {
				id: ship.id,
				x: new Number(ship.x),
				y: new Number(ship.y),
				a: new Number(ship.a),
				acc: ship.acc
			};
		}
		
		previousAsteroids = asteroids;
		asteroids = [];
		for (var i in data.asteroids) {
			var asteroid = data.asteroids[i];
			asteroids[asteroid.id] = {
				x: new Number(asteroid.x),
				y: new Number(asteroid.y),
				r: new Number(asteroid.r)
			}
		}
		
		previousBullets = bullets;
		bullets = [];
		for (var i in data.bullets) {
			var bullet = data.bullets[i];
			bullets[bullet.id] = {
				x: new Number(bullet.x),
				y: new Number(bullet.y)
			}
		}
		
		lastUpdate = new Date().getTime();
		updateParticles();
	}
	
	function updateParticles() {
		var now = new Date().getTime();
		
		for (var i in particles) {
			if (particles[i].t < now - 1000) {
				particles.splice(i, particles.length - i);
				break;
			}
		}
		
		for (var s in previousShips) {
			var ship = previousShips[s];
			if (ship.acc) {
				for (var i = 0; i < 5; i++) {
					var angle = ship.a + Math.PI + (Math.PI / 8 * Math.random() - Math.PI / 16);
					var magnitude = .75 + .25 * Math.random();
					particles.unshift({
						t: now,
						a: angle,
						v: magnitude,
						r: .09 + .01 * Math.random(),
						ship: ship.id
					});
				}
			}
		}
	}
	
	return {
		initialize: initialize,
	};
})();

$(document).ready(function () {
	$(window).resize(resizeCanvas);
	resizeCanvas();
	
	var socket = io.connect('//');
	Game.initialize(socket);
	
	function resizeCanvas() {
		var viewportWidth = $(window).width();
		var viewportHeight = $(window).height();
		
		// Use 9:16 aspect ratio
		var canvasWidth = viewportWidth;
		var canvasHeight = Math.floor(viewportWidth * 9 / 16);
		
		if (viewportWidth * 9 / 16 > viewportHeight) {
			canvasWidth = Math.floor(viewportHeight * 16 / 9);
			canvasHeight = viewportHeight;
		}
		
		$("#viewport")
			.prop('width', canvasWidth)
			.prop('height', canvasHeight)
			.css('top', (viewportHeight - canvasHeight) / 2 + 'px')
			.css('left', (viewportWidth - canvasWidth) / 2 + 'px');
		$("#qr")
			.css('top', ((viewportHeight - canvasHeight) / 2) + 10 + 'px')
			.css('left', ((viewportWidth - canvasWidth) / 2) + 10 + 'px');
	}
});
