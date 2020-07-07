
var element = document.getElementById("carousel");
var first = element.firstElementChild.cloneNode(true);
var last = element.lastElementChild.cloneNode(true);
//Add a copy of the first and last elements to the end and front to make it look like an infinite loop both directions.
element.insertBefore(last, element.firstChild);
element.appendChild(first);
//Make the whole thing the correct width
element.style.width = element.childElementCount * 100 + "%";

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

//Setup Indicators
var bubbles = document.getElementsByClassName("carousel-indicators")[0];
var bubbleElement = document.createElement("div");
bubbleElement.classList.toggle("bubble");
for (let bubble = 0; bubble < maxSlideIndex; bubble++) {
  bubbles.appendChild(bubbleElement.cloneNode(true));
}
//For some reason it's offset by one so move it
move();

function tick() {
  if (time >= slideStay + slideDuration) {
    time = 0;
    if (currentSlide == maxSlideIndex && !reverse) {
      currentSlide = 1;
      element.style.transform = "translateX(-" + 100/element.childElementCount + ")";
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
  element.style.transform = "translateX(-" + offset/element.childElementCount + "%)";
}

function pageForward() {
  if (time < slideStay) {
    time = slideStay;
  }
}

function pageBack() {
  reverse = true;
  if (time < slideStay) {
    time = slideStay;
  }
}

function updateIndicators() {
  var bubbleElement = document.getElementsByClassName("carousel-indicators")[0]
  for (let i = 0; i < maxSlideIndex - 1; i++) {
    bubbleElement.children[i].classList.remove("bubble-active");
  }
  bubbleElement.children[currentSlide - 1].classList.add("bubble-active");
}