
document.addEventListener("submit", function(event) {
    const form = event.target;

    if (!form.matches("[data-remember-scroll='true']")) {
        return;
    }

    sessionStorage.setItem("eventManagerScrollY", String(window.scrollY));
});

window.addEventListener("load", function() {
    const savedScrollY = sessionStorage.getItem("eventManagerScrollY");

    if (!savedScrollY) {
        return;
    }

    sessionStorage.removeItem("eventManagerScrollY");

    setTimeout(function() {
        window.scrollTo({
            top: Number(savedScrollY),
            behavior: "auto"
        });
    }, 50);
});