document.addEventListener("DOMContentLoaded", function () {
    const selector = document.querySelector("[data-role-selector]");

    if (!selector) {
        return;
    }

    const options = selector.querySelectorAll("[data-role-option]");
    const cta = document.querySelector("[data-role-cta]");
    const ctaText = document.querySelector("[data-role-cta-text]");
    const helper = document.querySelector("[data-role-helper]");
    let ctaUpdateTimer;

    const roleDetails = {
        organiser: {
            ctaText: "Continue as Organiser",
            href: "/organiser/home",
            helperText: "If you are not logged in, you will be taken to the organiser login page.",
        },
        attendee: {
            ctaText: "Continue as Attendee",
            href: "/attendee/home",
            helperText: "If you are not logged in, you will be taken to the attendee login page.",
        },
    };

    function updateRole(selectedRole) {
        const selectedDetails = roleDetails[selectedRole];

        if (!selectedDetails || selector.dataset.selected === selectedRole) {
            return;
        }

        selector.dataset.selected = selectedRole;

        options.forEach(function (option) {
            const isSelected = option.dataset.roleOption === selectedRole;

            option.classList.toggle("is-selected", isSelected);
            option.setAttribute("aria-pressed", String(isSelected));
        });

        clearTimeout(ctaUpdateTimer);
        cta.classList.add("is-changing");

        ctaUpdateTimer = setTimeout(function () {
            ctaText.textContent = selectedDetails.ctaText;
            cta.href = selectedDetails.href;
            helper.textContent = selectedDetails.helperText;
            cta.classList.remove("is-changing");
        }, 120);
    }

    options.forEach(function (option) {
        option.addEventListener("click", function () {
            updateRole(option.dataset.roleOption);
        });
    });
});
