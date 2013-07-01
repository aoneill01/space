"use strict";

/**
Helper class for managing vectors. Based on 
http://codeflow.org/entries/2010/aug/28/integration-by-example-euler-vs-verlet-vs-runge-kutta/helper.js
**/
var Vector = function(x, y){
    this.x = x;
    this.y = y;
}

/**
Returns a vector for a given angle in radians and magnitude.
**/
function vectorForAngle(angle, magnitude) {
    return new Vector(magnitude * Math.cos(angle), -magnitude * Math.sin(angle));
}

Vector.prototype = {
    isub: function(other){
        this.x -= other.x;
        this.y -= other.y;
        return this;
    },
    sub: function(other){
        return new Vector(
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
        return new Vector(
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
        return new Vector(
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
        return new Vector(
            this.x / scalar,
            this.y / scalar
        )
    },

    normalized: function(){
        var x=this.x, y=this.y;
        var length = Math.sqrt(x*x + y*y)
        return new Vector(x/length, y/length);
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
        return new Vector(this.x, this.y);
    },
    
    iset: function(other) {
        this.x = other.x;
        this.y = other.y;
    }
}

// Export this library for node.js
if (typeof exports !== "undefined") {
	exports.Vector = Vector;
	exports.vectorForAngle = vectorForAngle;
}