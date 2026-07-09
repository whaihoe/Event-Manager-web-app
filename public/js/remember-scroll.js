// ===== START OF MY CODE =====
/**
 * @purpose Saves the page position before an event form is submitted
 * @input Browser submit event
 * @output Stores the current vertical position for selected forms
 */
function rememberScrollPosition(event) {
    const form = event.target;

    if (!form.matches("[data-remember-scroll='true']")) {
        return;
    }

    sessionStorage.setItem('eventManagerScrollY', String(window.scrollY));
}

/**
 * @purpose Checks for a saved page position after the page loads
 * @input Browser load event
 * @output Schedules the saved position to be restored
 */
function loadSavedScrollPosition() {
    const savedScrollY = sessionStorage.getItem('eventManagerScrollY');

    if (!savedScrollY) {
        return;
    }

    sessionStorage.removeItem('eventManagerScrollY');
    setTimeout(restoreScrollPosition.bind(null, savedScrollY), 50);
}

/**
 * @purpose Restores the page to its saved vertical position
 * @input Saved vertical page position
 * @output Scrolls the browser to that position
 */
function restoreScrollPosition(savedScrollY) {
    window.scrollTo({
        top: Number(savedScrollY),
        behavior: 'auto',
    });
}

document.addEventListener('submit', rememberScrollPosition);
window.addEventListener('load', loadSavedScrollPosition);
// ===== END OF MY CODE =====
