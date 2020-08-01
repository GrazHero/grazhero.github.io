const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
const canvasWidth = 320;
const canvasHeight = 240;
const cellSize = 16; // canvasWidth and canvasHeight must be divisible by this
const gridWidth = canvasWidth / cellSize;
const gridHeight = canvasHeight / cellSize;
const gridHalfWidth = Math.floor(gridWidth / 2);
const gridHalfHeight = Math.floor(gridHeight / 2);
const tickRate = 1/30;

var playerSnake   = null;
var numTicks      = 0;
var currTicks     = 0;
var prevTicks     = 0;
var tickThreshold = 30; // after 30 ticks, advance the state of the game

var StateEnum = {
    //STARTING: 0,
    PLAYING: 1,
    GAMEOVER: 2,
};
var currentState  = StateEnum.PLAYING;

var DirEnum = {
    UP: 0,
    DOWN: 1,
    LEFT: 2,
    RIGHT: 3,
    opposite: function(dir) {
	switch(dir) {
	case DirEnum.UP:
	    return DirEnum.DOWN;
	    break;
	case DirEnum.DOWN:
	    return DirEnum.UP;
	    break;
	case DirEnum.LEFT:
	    return DirEnum.RIGHT;
	    break;
	case DirEnum.RIGHT:
	    return DirEnum.LEFT;
	    break;
	default:
	    return null;
	}
    }
};

window.onload = function() {
    document.body.focus();
    setInterval(loop, tickRate);
    window.addEventListener("keydown", onKeyDown);
    playerSnake = new Snake();
    apple.relocate();
};

function Snake() {
    // length is the starting length of the snake
    this.head = new SnakePiece(gridHalfWidth, gridHalfHeight);
    //this.length = 2; // actually I probably don't even need to store the length?
    this.dir = DirEnum.RIGHT;
    // create one body piece to start with
    this.head.next = new SnakePiece(gridHalfWidth - 1, gridHalfHeight);

    this.lastMove = null; // this will be a direction
    this.growState = 0; // this needs to be a three stage process

    this.draw = function() {
	context.fillStyle = "black";
	this.head.draw();
    };

    this.move = function() {
	this.lastMove = this.dir;
	
	if(this.growState === 1)
	    this.growState = 2;
	
	this.head.move(this.dir);
    };

    this.changeDir = function(dir) {
	if(dir === DirEnum.opposite(this.dir) || dir === DirEnum.opposite(this.lastMove))
	    return;
	else
	    this.dir = dir;
	// I need to keep track of what the last direction the head moved in was
    };

    this.intersects = function(x, y) {
	this.head.intersects(x, y);
    };
}

function SnakePiece(x, y) {
    this.next = null;
    this.x = x;
    this.y = y;

    this.draw = function() {
	context.fillRect(cellSize * this.x,
			 cellSize * this.y,
			 cellSize,
			 cellSize);
	
	if(this.next === null)
	     return;
	 else
	     this.next.draw();
    };

    this.move = function(dir) {
	let oldX = this.x;
	let oldY = this.y;
	
	switch(dir) {
	case DirEnum.UP:
	    this.y -= 1;
	    break;
	case DirEnum.DOWN:
	    this.y += 1;
	    break;
	case DirEnum.LEFT:
	    this.x -= 1;
	    break;
	case DirEnum.RIGHT:
	    this.x += 1;
	    break;
	}

	// check if we've hit the apple
	if(this.intersects(apple.x, apple.y)) {
	    apple.relocate();
	    playerSnake.growState = 1;
	}

	// check if we're out of bounds (this is a lose condition)
	if(this.x < 0 ||
	   this.x >= gridWidth ||
	   this.y < 0 ||
	   this.y >= gridHeight) {
	    currentState = StateEnum.GAMEOVER;
	}

	// check if we've hit ourself
	if(this.next.intersects(this.x, this.y))
	    currentState = StateEnum.GAMEOVER;

	if(this.next != null)
	    this.next.movePrime(oldX, oldY);
	else
	    return;
    };

    this.movePrime = function(newX, newY) {
	let oldX = this.x;
	let oldY = this.y;

	this.x = newX;
	this.y = newY;

	if(this.next != null) {
	    this.next.movePrime(oldX, oldY);
	} else {
	    // normally we'd just return here since we're at the end of the snake.
	    // but if the growState is 2, we must create a new snake piece
	    if(playerSnake.growState != 2) {
		return;
	    } else {
		this.next = new SnakePiece(oldX, oldY);
		playerSnake.growState = 0;
	    }
	    return;
	}
    };

    this.intersects = function(x, y) {
	if(this.x === x && this.y === y)
	    return true;
	else if(this.next != null)
	    return this.next.intersects(x, y);
	else return false;
    };
}

var apple = {
    // Let's just have one apple that teleports around. it'll be easier.
    x: 0,
    y: 0,
    draw: function() {
	context.fillStyle = "#91E747"; // light green
	context.fillRect(cellSize * this.x,
			 cellSize * this.y,
			 cellSize,
			 cellSize);
    },
    
    relocate: function() {
	do {
	    presumptiveX = Math.round( Math.random() * (gridWidth - 1) );
	    presumptiveY = Math.round( Math.random() * (gridHeight - 1) );
	} while(playerSnake.intersects(presumptiveX, presumptiveY));

	// if we break out of that loop, then we know the presumptive coords don't intersect the snake
	this.x = presumptiveX;
	this.y = presumptiveY;
    }
};

function onKeyDown(e) {
    if(e.code == "ArrowUp")
	playerSnake.changeDir(DirEnum.UP);
    if(e.code == "ArrowDown")
	playerSnake.changeDir(DirEnum.DOWN);
    if(e.code == "ArrowLeft")
	playerSnake.changeDir(DirEnum.LEFT);
    if(e.code == "ArrowRight")
	playerSnake.changeDir(DirEnum.RIGHT);
    if(e.code == "KeyR")
	restartGame();
}

function loop() {
    if(currentState === StateEnum.PLAYING)
	update();
    draw();
}

function update() {
    numTicks++;
    currTicks = numTicks;
    if(currTicks - prevTicks > tickThreshold) {
	playerSnake.move();
	prevTicks = currTicks;
    }
}

function draw() {
    // clear the canvas
    context.fillStyle = "white";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    playerSnake.draw();
    apple.draw();
}

function restartGame() {
    currentState = StateEnum.PLAYING;
    playerSnake = new Snake();
    apple.relocate();
}
