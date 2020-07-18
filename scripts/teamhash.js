window.onhashchange = function(){

    var selected = document.getElementsByClassName("media has-text-white-ter has-background-black-bis");

    for (let i = 0; i < selected.length; i++) {
        selected[i].classList.remove("has-background-black-bis");
    }

    setCurrentBackground();
}

document.addEventListener('DOMContentLoaded', () => {
    setCurrentBackground();
});

function setCurrentBackground() {
    if (window.location.hash.substring(1)) {
        document.getElementById("" + window.location.hash.substring(1)).classList.toggle("has-background-black-bis");
    }
}