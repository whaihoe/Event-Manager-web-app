// This script handles the "Copy Share Link" button functionality for event cards.

document.addEventListener("click", function (event) {
    if (!event.target.classList.contains("copy-share-link")) {
        return;
    }

    const button = event.target;
    const sharePath = button.getAttribute("data-share-url");
    const fullShareUrl = window.location.origin + sharePath;
    const originalText = button.textContent;

    function showCopiedMessage() {
        button.textContent = "Copied!";

        setTimeout(function () {
            button.textContent = originalText;
        }, 1500);
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(fullShareUrl).then(function () {
            showCopiedMessage();
        });
    } else {
        const temporaryInput = document.createElement("input");

        temporaryInput.value = fullShareUrl;
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand("copy");
        document.body.removeChild(temporaryInput);

        showCopiedMessage();
    }
});