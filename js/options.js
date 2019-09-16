let automaticSuntimesRadio = document.getElementById("automatic-suntimes-radio");
let manualSuntimesRadio = document.getElementById("manual-suntimes-radio");

let checkStartupBox = document.getElementById("check-startup-only");
let sunriseInput = document.getElementById("sunrise-time");
let sunsetInput = document.getElementById("sunset-time");

let daytimeThemeList = document.getElementById("daytime-theme-list");
let nighttimeThemeList = document.getElementById("nighttime-theme-list");
let geolocationBtn = document.getElementById("geolocation-btn");
let resetDefaultBtn = document.getElementById("reset-default-btn");

let sunriseInputEvent = new Event("input");
let sunsetInputEvent = new Event("input");

/*
// Log everything stored.
browser.storage.local.get(null)
    .then((results) => {
        console.log("automaticDark DEBUG: All stored data:");
        console.log(results);
    }, onError);
*/
// logAllAlarms();

// Darken the page theme if the current theme is 
// Firefox's default dark theme.
browser.management.get("firefox-compact-dark@mozilla.org")
    .then((extInfo) => {
        if (extInfo.enabled) {
            document.getElementsByTagName("body")[0].className = "night"; 
        }
        else {
            document.getElementsByTagName("body")[0].className = "day";
        }
    });

// If the current theme changes to Firefox's default dark theme,
// darken the Options page.
browser.management.onEnabled.addListener((ext) => {
    if (ext.id === "firefox-compact-dark@mozilla.org") {
        document.getElementsByTagName("body")[0].className = "night"; 
    }
    else if (ext.type === "theme") {
        document.getElementsByTagName("body")[0].className = "day";
    }
})

// Iterate through each extension to populate the dropdowns.
browser.management.getAll().then((extensions) => {
    for (let extension of extensions) {
        // Add each theme as an option in the dropdowns.
        if (extension.type === 'theme') {
            let extOption = document.createElement('option');
            extOption.textContent = extension.name;
            extOption.value = extension.id;

            daytimeThemeList.appendChild(extOption);
            nighttimeThemeList.appendChild(extOption.cloneNode(true));
        }
    }

    // Set the default value of the dropdowns.
    browser.storage.local.get(DAYTIME_THEME_KEY)
        .then((theme) => {
            theme = theme[Object.keys(theme)[0]];

            if (!isEmpty(theme)) {
                daytimeThemeList.value = theme.themeId;
            }
        }, onError);

    browser.storage.local.get(NIGHTTIME_THEME_KEY)
        .then((theme) => {
            theme = theme[Object.keys(theme)[0]];

            if (!isEmpty(theme)) {
                nighttimeThemeList.value = theme.themeId;
            }
        }, onError);
});

browser.storage.local.get(AUTOMATIC_SUNTIMES_KEY)
    .then((obj) => {
        automaticSuntimesRadio.checked = obj[AUTOMATIC_SUNTIMES_KEY].check;
        manualSuntimesRadio.checked = !obj[AUTOMATIC_SUNTIMES_KEY].check;
        sunriseInput.disabled = obj[AUTOMATIC_SUNTIMES_KEY].check;
        sunsetInput.disabled = obj[AUTOMATIC_SUNTIMES_KEY].check;
    }, onError);

browser.storage.local.get(CHECK_TIME_STARTUP_ONLY_KEY)
    .then((obj) => {
        checkStartupBox.checked = obj[CHECK_TIME_STARTUP_ONLY_KEY].check;
    }, onError);

browser.storage.local.get([SUNRISE_TIME_KEY, SUNSET_TIME_KEY])
    .then((obj) => {
        sunriseInput.value = obj[SUNRISE_TIME_KEY].time;
        sunsetInput.value = obj[SUNSET_TIME_KEY].time;
    }, onError);

automaticSuntimesRadio.addEventListener("input", function(event) {
    if (automaticSuntimesRadio.checked) {

        // Prompt for and set the user's geolocation in storage.
        setGeolocation()
            .then(
                // Calculate sunrise/sunset times based on location.
                calculateSuntimes, 
                onError)
            .then((suntimes) => {
                // Make changes to settings based on calculation results.
                let sunriseHours = suntimes.nextSunrise.getHours();
                let sunriseMinutes = suntimes.nextSunrise.getMinutes();
                let sunsetHours = suntimes.nextSunset.getHours();
                let sunsetMinutes = suntimes.nextSunset.getMinutes();

                browser.storage.local.set({[AUTOMATIC_SUNTIMES_KEY]: {check: true}});
                sunriseInput.disabled = true;
                sunsetInput.disabled = true;

                sunriseInput.value = addLeadZero(sunriseHours) + ":" + addLeadZero(sunriseMinutes);
                sunsetInput.value = addLeadZero(sunsetHours) + ":" + addLeadZero(sunsetMinutes);
                sunriseInput.dispatchEvent(sunriseInputEvent);
                sunsetInput.dispatchEvent(sunsetInputEvent);
            }, (error) => {
                onError(error);
                automaticSuntimesRadio.checked = false;
                manualSuntimesRadio.checked = true;
        });
    }
});

manualSuntimesRadio.addEventListener("input", function(event) {
    if (manualSuntimesRadio.checked) {
        browser.storage.local.set({[AUTOMATIC_SUNTIMES_KEY]: {check: false}});
        sunriseInput.disabled = false;
        sunsetInput.disabled = false;
    }
});

// Enable/disable the check on startup-only flag.
checkStartupBox.addEventListener("input", function(event) {
    if (checkStartupBox.checked) {
        browser.storage.local.set({[CHECK_TIME_STARTUP_ONLY_KEY]: {check: true}});
        Promise.all([
                browser.alarms.clear(NEXT_SUNRISE_ALARM_NAME),
                browser.alarms.clear(NEXT_SUNSET_ALARM_NAME)
            ])
            .then(() => {
                logAllAlarms();
            }, onError);
    }
    else {
        browser.storage.local.set({[CHECK_TIME_STARTUP_ONLY_KEY]: {check: false}});
        createAlarm(SUNRISE_TIME_KEY, NEXT_SUNRISE_ALARM_NAME, 60 * 24);
        createAlarm(SUNSET_TIME_KEY, NEXT_SUNSET_ALARM_NAME, 60 * 24);
}
});

// If the sunrise time input is changed,
// change the sunrise time and check if the current theme should be changed.
// Also create an alarm if the 'check startup only' flag is disabled.
sunriseInput.addEventListener("input", function(event) {
    browser.storage.local.set({[SUNRISE_TIME_KEY]: {time: sunriseInput.value}})
        .then(() => {
            checkTime();
            return browser.storage.local.get(CHECK_TIME_STARTUP_ONLY_KEY)
        }, onError)
        .then((obj) => {
            if (!obj[CHECK_TIME_STARTUP_ONLY_KEY].check) {
                return createAlarm(SUNRISE_TIME_KEY, NEXT_SUNRISE_ALARM_NAME, 60 * 24);
            }
        });
});

// If the sunset time input is changed,
// change the sunset time and check if the current theme should be changed.
sunsetInput.addEventListener("input", function(event) {
    browser.storage.local.set({[SUNSET_TIME_KEY]: {time: sunsetInput.value}})
        .then(() => {
            checkTime();
            return browser.storage.local.get(CHECK_TIME_STARTUP_ONLY_KEY);
        }, onError)
        .then((obj) => {
            if (!obj[CHECK_TIME_STARTUP_ONLY_KEY].check) {
                return createAlarm(SUNSET_TIME_KEY, NEXT_SUNSET_ALARM_NAME, 60 * 24);
            }
        });
});

// If the dropdown for daytime themes is changed,
// set the daytime theme and check if the current theme should be changed.
daytimeThemeList.addEventListener('change', function(event) {
    browser.storage.local.set({[DAYTIME_THEME_KEY]: {themeId: this.value}})
        .then(() => {
            return checkTime();
        }, onError);
    }
);

// If the dropdown for nighttime themes is changed,
// set the nighttime theme and check if the current theme should be changed.
nighttimeThemeList.addEventListener('change', function(event) {
    browser.storage.local.set({[NIGHTTIME_THEME_KEY]: {themeId: this.value}})
        .then(() => {
            return checkTime();
        }, onError);
    }
);

// Reset all settings to their default.
// Note that the "default" themes may change
// depending on the user's current theme and their 
// installed themes.
resetDefaultBtn.addEventListener("click", 
    function(event) {
        if (window.confirm("Are you sure you want to reset to default settings?")) {
            Promise.all([
                    browser.storage.local.clear(),
                    browser.alarms.clearAll()
                ])
                .then(() => {
                    automaticSuntimesRadio.checked = DEFAULT_AUTOMATIC_SUNTIMES;
                    manualSuntimesRadio.checked = !DEFAULT_AUTOMATIC_SUNTIMES;
                    sunriseInput.disabled = DEFAULT_AUTOMATIC_SUNTIMES;
                    sunsetInput.disabled = DEFAULT_AUTOMATIC_SUNTIMES;

                    checkStartupBox.checked = DEFAULT_CHECK_TIME_STARTUP_ONLY;
                    sunriseInput.value = DEFAULT_SUNRISE_TIME;
                    sunsetInput.value = DEFAULT_SUNSET_TIME;

                    return setDefaultThemes();

                }, onError)
                .then(() => {
                    daytimeThemeList.value = DEFAULT_DAYTIME_THEME;
                    nighttimeThemeList.value = DEFAULT_NIGHTTIME_THEME;
                    return init();
                });
        }
    }
);