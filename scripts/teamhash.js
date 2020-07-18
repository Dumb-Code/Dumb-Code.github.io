window.onhashchange = function(){

    let selected = document.getElementsByClassName("media");

    for (let i = 0; i < selected.length; i++) {
        if (selected[i].classList.contains("notification")) {
            selected[i].classList.remove("notification");
        }
    }

    setCurrentBackground();
}

document.addEventListener('DOMContentLoaded', () => {
    setCurrentBackground();
});

function setCurrentBackground() {
    console.log(document.getElementById("" + window.location.hash.substring(1)).classList);
    if (window.location.hash.substring(1)) {
        document.getElementById("" + window.location.hash.substring(1)).classList.add("notification");
    }
}