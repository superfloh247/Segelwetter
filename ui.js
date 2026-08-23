// Segelwetter – UI rendering: weather panel, forecast table, modals, banners (split from script.js)

let selectedForecastColumn = -1; // -1 means no column selected yet; auto-select on first data load

function displayWeather(data) {
    if (elements.locationName) {
        elements.locationName.textContent = data.location || '-';
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = data.wind.speed != null ? `${kmhToKnots(data.wind.speed)}` : '-';
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = data.wind.direction ? formatWindDirection(data.wind.direction, data.wind.directionDegrees) : '-';
    }
    if (elements.temperature) {
        elements.temperature.textContent = data.temperature != null ? `${data.temperature}` : '-';
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = data.wind.gusts != null ? `${kmhToKnots(data.wind.gusts)}` : '-';
    }
}

function findNextGoodSailingSlot(criteria) {
    const now = Date.now();
    const nextSlot = weatherData.hourlyForecast.find(item => {
        if (!item.timestamp || item.timestamp <= now) return false;
        const date = new Date(item.timestamp);
        const hour = date.getHours();
        const baseWind = kmhToKnots(item.speed);
        const gustWind = kmhToKnots(item.gusts);
        return baseWind >= criteria.baseWindMin && baseWind <= criteria.baseWindMax && gustWind <= criteria.gustMax && hour >= criteria.hourMin && hour < criteria.hourMax;
    });

    if (!nextSlot) {
        return t('noSlotFound');
    }

    const date = new Date(nextSlot.timestamp);
    const formattedDate = date.toLocaleDateString(t('dateLocale'), {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
    });
    const formattedTime = date.toLocaleTimeString(t('dateLocale'), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return t('slotFormat')
        .replace('{date}', formattedDate)
        .replace('{time}', formattedTime)
        .replace('{wind}', kmhToKnots(nextSlot.speed).toFixed(1))
        .replace('{gusts}', kmhToKnots(nextSlot.gusts).toFixed(1));
}

function updateSailingAdvice() {
    const catElement = document.getElementById('sailingAdviceCat');
    const jolleElement = document.getElementById('sailingAdviceJolle');
    if (catElement) {
        catElement.textContent = findNextGoodSailingSlot({
            baseWindMin: 8,
            baseWindMax: 14,
            gustMax: 18,
            hourMin: 10,
            hourMax: 18
        });
    }
    if (jolleElement) {
        jolleElement.textContent = findNextGoodSailingSlot({
            baseWindMin: 3,
            baseWindMax: 6,
            gustMax: 10,
            hourMin: 10,
            hourMax: 18
        });
    }
}

function displayHourlyForecast() {
    const table = document.getElementById('hourlyForecastTable');
    if (!table) return;

    if (weatherData.hourlyForecast.length === 0) {
        table.innerHTML = `<tr><td colspan="100" class="forecast-empty">${t('noForecastData')}</td></tr>`;
        return;
     }

    const headerRow = weatherData.hourlyForecast.map(item => item.hour);
    const dateGroups = [];
    weatherData.hourlyForecast.forEach(item => {
        if (!dateGroups.length || dateGroups[dateGroups.length - 1].dateLabel !== item.dateLabel) {
            dateGroups.push({ dateLabel: item.dateLabel, count: 1 });
        } else {
            dateGroups[dateGroups.length - 1].count += 1;
        }
    });

    const forecast = weatherData.hourlyForecast;
    const hasCape = forecast.some(item => typeof item.cape === 'number' && item.cape > 500);
    const hasSeaTemp = forecast.some(item => typeof item.seaSurfaceTemp === 'number' && !isNaN(item.seaSurfaceTemp));
    const hasWaveHeight = forecast.some(item => typeof item.waveHeight === 'number' && !isNaN(item.waveHeight));

    // Tabellenzeilen per DocumentFragment aufbauen (ein einziger Reflow)
    // statt innerHTML-String-Konkatenation – performanter bei größeren Datenmengen.
    const fragment = document.createDocumentFragment();

    // thead: Datumszeile (gruppiert) + Uhrzeitenzeile
    const thead = document.createElement('thead');

    const dateRow = document.createElement('tr');
    dateRow.className = 'date-row';
    const dateCorner = document.createElement('th');
    dateCorner.className = 'label-cell empty-cell';
    dateRow.appendChild(dateCorner);
    dateGroups.forEach(group => {
        const th = document.createElement('th');
        th.colSpan = group.count;
        th.textContent = group.dateLabel;
        dateRow.appendChild(th);
    });
    thead.appendChild(dateRow);

    const timeRow = document.createElement('tr');
    timeRow.className = 'time-row';
    const timeCorner = document.createElement('th');
    timeCorner.className = 'label-cell empty-cell';
    timeRow.appendChild(timeCorner);
    headerRow.forEach(cell => {
        const th = document.createElement('th');
        th.textContent = cell;
        timeRow.appendChild(th);
    });
    thead.appendChild(timeRow);
    fragment.appendChild(thead);

    // tbody: eine Zeile pro Messgröße
    const tbody = document.createElement('tbody');

    function appendMetricRow(label, cells) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.className = 'label-cell';
        th.textContent = label;
        tr.appendChild(th);
        cells.forEach(cell => {
            const td = document.createElement('td');
            if (cell.className) {
                td.className = cell.className;
            }
            if (cell.danger) {
                const span = document.createElement('span');
                span.className = 'cape-danger';
                span.textContent = '!!';
                td.appendChild(span);
            } else {
                td.textContent = cell.value != null ? cell.value : '';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }

    appendMetricRow(t('forecastBaseWind'), forecast.map(item => {
        const knots = kmhToKnots(item.speed);
        return { value: `${knots}`, className: windSpeedClass(Number(knots)) };
    }));
    appendMetricRow(t('forecastGusts'), forecast.map(item => {
        const knots = kmhToKnots(item.gusts);
        return { value: `${knots}`, className: gustSpeedClass(Number(knots)) };
    }));
    appendMetricRow(t('forecastTemperature'), forecast.map(item => ({ value: `${item.temp}${t('celsius')}` })));
    appendMetricRow(t('forecastWindDirection'), forecast.map(item => ({ value: item.direction })));

    if (hasSeaTemp) {
        appendMetricRow(t('forecastWaterTemp'), forecast.map(item => ({
            value: item.seaSurfaceTemp != null && !isNaN(item.seaSurfaceTemp) ? `${(Math.round(item.seaSurfaceTemp * 10) / 10)}°C` : '—'
        })));
    }

    if (hasCape) {
        appendMetricRow(t('forecastStorm'), forecast.map(item => {
            const cape = item.cape;
            if (typeof cape !== 'number' || isNaN(cape) || cape <= 500) {
                return { value: '' };
            }
            if (cape > 1500) {
                return { danger: true };
            }
            return { value: '!' };
        }));
    }

    if (hasWaveHeight) {
        appendMetricRow(t('forecastWaveHeight'), forecast.map(item => ({
            value: item.waveHeight != null && !isNaN(item.waveHeight) ? `${(Math.round(item.waveHeight * 10) / 10)} m` : '—'
        })));
    }
    fragment.appendChild(tbody);

    table.innerHTML = '';
    table.appendChild(fragment);

    // Auto-select first data column (index 1) if no column is selected yet
    // Column 0 is the label cell, so first weather data starts at column 1
    if (selectedForecastColumn < 0) {
        highlightForecastColumn(1);
    } else {
        highlightForecastColumn(selectedForecastColumn);
    }
}

function getForecastByColumn(columnIndex) {
    if (!weatherData.hourlyForecast || columnIndex <= 0) return null;
    return weatherData.hourlyForecast[columnIndex - 1] || null;
}

function updateWeatherPanelFromSelectedForecast() {
    const forecast = getForecastByColumn(selectedForecastColumn);
    if (!forecast) {
        displayWeather(weatherData);
        return;
    }

    if (elements.temperature) {
        elements.temperature.textContent = `${forecast.temp}`;
    }
    if (elements.windSpeed) {
        elements.windSpeed.textContent = `${kmhToKnots(forecast.speed)}`;
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = `${kmhToKnots(forecast.gusts)}`;
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = formatWindDirection(forecast.direction, forecast.directionDegrees);
    }
}

function highlightForecastColumn(columnIndex) {
    selectedForecastColumn = columnIndex;
    const table = document.getElementById('hourlyForecastTable');
    if (!table) return;

    const cells = table.querySelectorAll('th, td');
    cells.forEach(cell => cell.classList.remove('selected-column'));

    Array.from(table.rows).forEach(row => {
        const cell = row.cells[columnIndex];
        if (cell) {
            cell.classList.add('selected-column');
        }
    });

    updateMarkerFromSelectedColumn();
    updateWeatherPanelFromSelectedForecast();
}

function showLoadingOverlay(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
}

function showErrorBanner(message) {
    if (!elements.errorBanner) return;
    if (elements.errorBannerText) elements.errorBannerText.textContent = message;
    elements.errorBanner.classList.remove('hidden');
}

function hideErrorBanner() {
    if (!elements.errorBanner) return;
    elements.errorBanner.classList.add('hidden');
}

function showIOSInstallPrompt() {
    if (!isIOS || isStandalone) return;
    try {
        const dismissed = localStorage.getItem('segelwetter:iosInstallDismissed');
        if (dismissed) return;
    } catch (error) {
        // localStorage not available
    }
    const overlay = document.getElementById('iosInstallOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const dismissBtn = document.getElementById('iosInstallDismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            try {
                localStorage.setItem('segelwetter:iosInstallDismissed', '1');
            } catch (error) {
                // localStorage not available
            }
        });
    }
    // Auch schließbar per Backdrop-Klick
    const backdrop = overlay.querySelector('.ios-install-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            dismissBtn?.click();
        });
    }
}

function openModal(modal) {
    if (modal) {
        modal.classList.remove('hidden');
        // Set focus to the element marked with data-autofocus (if present),
        // otherwise to the first focusable element when modal opens
        const target = modal.querySelector('[data-autofocus]')
            || modal.querySelector('input, button, textarea, [tabindex]:not([tabindex="-1"])');
        if (target) {
            setTimeout(() => target.focus(), 50);
        }
    }
}

function closeModal(modal) {
    if (modal) {
        modal.classList.add('hidden');
    }
}

function trapModalFocus(event) {
    const activeModal = document.querySelector('.modal:not(.hidden)');
    if (!activeModal) return;

    const focusableElements = activeModal.querySelectorAll(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    const focusableArray = Array.from(focusableElements);
    if (focusableArray.length === 0) return;

    const firstElement = focusableArray[0];
    const lastElement = focusableArray[focusableArray.length - 1];

    if (event.key === 'Tab') {
        if (event.shiftKey) {
            if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    }

    // Close modal on Escape key
    if (event.key === 'Escape') {
        closeModal(activeModal);
    }
}

// Register global keyboard listener for focus trap
document.addEventListener('keydown', trapModalFocus);

function setupModalHandlers() {
    if (elements.locationName) {
        elements.locationName.addEventListener('click', requestRenameLocation);
    }
    if (elements.favoriteBtn) {
        elements.favoriteBtn.addEventListener('click', addOrUpdateFavorite);
    }
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            closeModal(modal);
        });
    });
    // Backdrop-Klick schließt alle Modals
    [elements.deleteFavoriteModal, elements.renameLocationModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', event => {
                if (event.target === modal) {
                    closeModal(modal);
                }
            });
        }
    });
    if (elements.errorBannerClose) {
        elements.errorBannerClose.addEventListener('click', hideErrorBanner);
    }
    if (elements.deleteFavoriteCancel) {
        elements.deleteFavoriteCancel.addEventListener('click', () => closeModal(elements.deleteFavoriteModal));
    }
    if (elements.deleteFavoriteConfirm) {
        elements.deleteFavoriteConfirm.addEventListener('click', confirmDeleteFavorite);
    }
    if (elements.renameLocationCancel) {
        elements.renameLocationCancel.addEventListener('click', () => closeModal(elements.renameLocationModal));
    }
    if (elements.renameLocationSave) {
        elements.renameLocationSave.addEventListener('click', confirmRenameLocation);
    }
    // Enter im Eingabefeld bestätigt das Umbenennen
    if (elements.renameLocationInput) {
        elements.renameLocationInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                confirmRenameLocation();
            }
        });
    }
}

function refreshCoordsText() {
    const coordsText = document.getElementById('coordsText');
    if (coordsText && weatherData.coords) {
        coordsText.textContent = `${weatherData.coords.lat.toFixed(6)}, ${weatherData.coords.lng.toFixed(6)}`;
    }
}

function setupPullToRefresh() {
    if (!isStandalone && !isIOS) return;
    const indicator = document.getElementById('pullToRefreshIndicator');
    if (!indicator) return;

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    let refreshing = false;
    const THRESHOLD = 80;

    document.addEventListener('touchstart', event => {
        if (window.scrollY !== 0 || refreshing) return;
        // Ignore touches originating from the map area to avoid conflict with map pan/zoom gestures
        const target = event.target;
        const mapElement = document.getElementById('map');
        if (mapElement && mapElement.contains(target)) return;
        dragging = true;
        startY = event.touches[0].pageY;
    }, { passive: true });

    document.addEventListener('touchmove', event => {
        if (!dragging || refreshing) return;
        currentY = event.touches[0].pageY - startY;
        if (currentY < 0) return;
        const widthPercent = Math.min(100, (currentY / THRESHOLD) * 100);
        indicator.style.width = widthPercent + '%';
        indicator.classList.add('active');
    }, { passive: true });

    document.addEventListener('touchend', async () => {
        if (!dragging) {
            dragging = false;
            return;
        }
        dragging = false;
        if (currentY >= THRESHOLD && !refreshing) {
            refreshing = true;
            indicator.style.width = '100%';
            await loadWeatherForCoords(weatherData.coords.lat, weatherData.coords.lng, weatherData.location);
            setTimeout(() => {
                indicator.classList.add('reset');
                indicator.style.width = '0';
                setTimeout(() => {
                    indicator.classList.remove('active', 'reset');
                    refreshing = false;
                }, 300);
            }, 500);
        } else {
            indicator.classList.add('reset');
            indicator.style.width = '0';
            setTimeout(() => {
                indicator.classList.remove('active', 'reset');
            }, 300);
        }
        currentY = 0;
    });
}