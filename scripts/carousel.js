var element = document.getElementById("carousel");
var first = element.firstElementChild.cloneNode(true);
var last = element.lastElementChild.cloneNode(true);
//Add a copy of the first and last elements to the end and front to make it look like an infinite loop both directions.
element.insertBefore(last, element.firstChild);
element.appendChild(first);
//Offset to after fake first slide
element.style.transform = "translateX(-100vw)";

var maxSlideIndex = element.childElementCount - 2;
var time = 0;
var currentSlide = 1;
var offset = 0;
var timer = setInterval(tick, 5);
var slideDuration = 50;
var slideStay = 1000;
var reverse = false;

document.getElementById("left").onclick = pageBack;
document.getElementById("right").onclick = pageForward;

updateIndicators();

function tick() {
  if (time >= slideStay + slideDuration) {
    time = 0;
    if (currentSlide == maxSlideIndex && !reverse) {
      currentSlide = 1;
      element.style.transform = "translateX(-100vw)";
    } else if (currentSlide == 1 && reverse) {
      currentSlide = maxSlideIndex;
    } else {
      reverse ? currentSlide-- : currentSlide++;
    }
    updateIndicators();
    reverse = false;
  }
  if (time > slideStay) {
    move();
  }
  time++;
}

function move() {
  if (reverse) {
    offset = (currentSlide * 100) - Math.sin(Math.PI * ((time / slideDuration) - 0.5)) * 50 - 50;
  } else {
    offset = (currentSlide * 100) + Math.sin(Math.PI * ((time / slideDuration) - 0.5)) * 50 + 50;
  }
  element.style.transform = "translateX(-" + Math.round(offset) + "vw)";
}

function pageForward() {
  time = slideStay;
}

function pageBack() {
  reverse = true;
  time = slideStay;
}

function updateIndicators() {
  const bubbleElement = document.getElementsByClassName("carousel-indicators")[0];
  var bubbles = "";
  for (var i = 1; i < maxSlideIndex + 1; i++) {
    i === currentSlide ? bubbles = bubbles + "⬤" : bubbles = bubbles + "⭘";
  }
  bubbleElement.innerText = bubbles;
}