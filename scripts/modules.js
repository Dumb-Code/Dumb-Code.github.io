document.addEventListener('DOMContentLoaded', () => {
    includeModules();
});

function getXMLType() {
    if (window.XMLHttpRequest) {// code for IE7+, Firefox, Chrome, Opera, Safari
        return new XMLHttpRequest();
    }
    else {// code for IE6, IE5
        return new ActiveXObject("Microsoft.XMLHTTP");
    }
}

function includeModules() {
    var z, i, elmnt, file, xhttp;
    //Loop through a collection of all HTML elements
    z = document.getElementsByTagName("*");
    for (i = 0; i < z.length; i++) {
      elmnt = z[i];
      //search for elements with a certain atrribute
      file = elmnt.getAttribute("module");
      if (file) {
        //Make an HTTP request using the attribute value as the file name
        xhttp = getXMLType();
        xhttp.onreadystatechange = function() {
          if (this.readyState == 4) {
            if (this.status == 200) {elmnt.innerHTML = this.responseText;}
            if (this.status == 404) {elmnt.innerHTML = "Error loading module.";}
            //Remove the attribute, and call this function again
            elmnt.removeAttribute("module");
            includeModules();
          }
        }
        xhttp.open("GET", file, true);
        xhttp.send();
        return;
      }
    }
  }