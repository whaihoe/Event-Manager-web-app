// ===== START OF MY CODE =====
/**
 * @purpose Handles clicks on event share buttons
 * @input Browser click event
 * @output Copies the selected event link when a share button is clicked
 */
function handleShareLinkClick(event) {
    const button = event.target.closest('.copy-share-link');

    if (!button) {
        return;
    }

    const sharePath = button.getAttribute('data-share-url');
    const fullShareUrl = window.location.origin + sharePath;
    const originalText = button.textContent;

    if (navigator.clipboard) {
        navigator.clipboard
            .writeText(fullShareUrl)
            .then(showCopiedMessage.bind(null, button, originalText));
        return;
    }

    copyLinkWithTemporaryInput(fullShareUrl);
    showCopiedMessage(button, originalText);
}

/**
 * @purpose Copies a link in browsers without the Clipboard API
 * @input Full event URL
 * @output Copies the URL using a temporary input
 */
function copyLinkWithTemporaryInput(fullShareUrl) {
    const temporaryInput = document.createElement('input');

    temporaryInput.value = fullShareUrl;
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    document.execCommand('copy');
    document.body.removeChild(temporaryInput);
}

/**
 * @purpose Shows confirmation after an event link is copied
 * @input Share button and its original text
 * @output Displays a short copied message, then restores the button
 */
function showCopiedMessage(button, originalText) {
    button.textContent = 'Copied!';
    setTimeout(restoreShareButtonText.bind(null, button, originalText), 1500);
}

/**
 * @purpose Restores the original share button label
 * @input Share button and its original text
 * @output Returns the button to its normal label
 */
function restoreShareButtonText(button, originalText) {
    button.textContent = originalText;
}

document.addEventListener('click', handleShareLinkClick);
// ===== END OF MY CODE =====
