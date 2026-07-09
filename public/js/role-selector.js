// ===== START OF MY CODE =====
const roleDetails = {
    organiser: {
        ctaText: 'Continue as Organiser',
        href: '/organiser/home',
        helperText:
            'If you are not logged in, you will be taken to the organiser login page.',
    },
    attendee: {
        ctaText: 'Continue as Attendee',
        href: '/attendee/home',
        helperText:
            'If you are not logged in, you will be taken to the attendee login page.',
    },
};

let ctaUpdateTimer;

/**
 * @purpose Sets up the role selector on the main page
 * @input The page after its HTML has loaded
 * @output Adds click handlers to the organiser and attendee options
 */
function initialiseRoleSelector() {
    const selector = document.querySelector('[data-role-selector]');

    if (!selector) {
        return;
    }

    const options = selector.querySelectorAll('[data-role-option]');
    options.forEach(registerRoleOption);
}

/**
 * @purpose Adds the click handler to one role option
 * @input One organiser or attendee option button
 * @output The button responds when it is selected
 */
function registerRoleOption(option) {
    option.addEventListener('click', handleRoleOptionClick);
}

/**
 * @purpose Handles a click on one role option
 * @input Browser click event
 * @output Updates the selected role and main link
 */
function handleRoleOptionClick(event) {
    const selectedRole = event.currentTarget.dataset.roleOption;
    updateRole(selectedRole);
}

/**
 * @purpose Updates the selected role and starts the text transition
 * @input Selected role name
 * @output Updates option states and schedules the new link content
 */
function updateRole(selectedRole) {
    const selector = document.querySelector('[data-role-selector]');
    const selectedDetails = roleDetails[selectedRole];

    if (!selector || !selectedDetails) {
        return;
    }

    if (selector.dataset.selected === selectedRole) {
        return;
    }

    selector.dataset.selected = selectedRole;

    const options = selector.querySelectorAll('[data-role-option]');
    options.forEach(updateRoleOption.bind(null, selectedRole));

    const cta = document.querySelector('[data-role-cta]');
    clearTimeout(ctaUpdateTimer);
    cta.classList.add('is-changing');

    ctaUpdateTimer = setTimeout(
        finishRoleUpdate.bind(null, selectedDetails),
        120,
    );
}

/**
 * @purpose Updates the visual state of one role option
 * @input Selected role name and one role option button
 * @output Sets the selected class and accessible pressed state
 */
function updateRoleOption(selectedRole, option) {
    const isSelected = option.dataset.roleOption === selectedRole;

    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-pressed', String(isSelected));
}

/**
 * @purpose Finishes the role link transition
 * @input Display details for the selected role
 * @output Updates the link text, destination and supporting message
 */
function finishRoleUpdate(selectedDetails) {
    const cta = document.querySelector('[data-role-cta]');
    const ctaText = document.querySelector('[data-role-cta-text]');
    const helper = document.querySelector('[data-role-helper]');

    ctaText.textContent = selectedDetails.ctaText;
    cta.href = selectedDetails.href;
    helper.textContent = selectedDetails.helperText;
    cta.classList.remove('is-changing');
}

document.addEventListener('DOMContentLoaded', initialiseRoleSelector);
// ===== END OF MY CODE =====
