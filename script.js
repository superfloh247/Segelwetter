// Segelwetter - Wettervorhersage für Segler

// Wetterdaten (Beispiel-Daten)
const weatherData = {
    location: "Deutschland",
    wind: {
        speed: 12,
        direction: "NW",
        gusts: 18
    },
    temperature: 16,
    humidity: 75,
    pressure: 1013,
    conditions: "Partly Cloudy",
    forecast: [
        { day: "Heute", wind: "NW 12 km/h", temp: "16°C" },
        { day: "Morgen", wind: "SW 15 km/h", temp: "14°C" },
        { day: "Übermorgen", wind: "N 10 km/h", temp: "17°C" }
    ]
};

// DOM-Elemente
const elements = {
    location: document.getElementById('location'),
    windSpeed: document.getElementById('wind-speed'),
    windDirection: document.getElementById('wind-direction'),
    temperature: document.getElementById('temperature'),
    humidity: document.getElementById('humidity'),
    pressure: document.getElementById('pressure'),
    conditions: document.getElementById('conditions')
};

// Wetter-Icon-Klasse bestimmen
function getWeatherIcon(condition) {
    const iconMap = {
        'Sunny': '☀️',
        'Partly Cloudy': '⛅',
        'Cloudy': '☁️',
        'Rain': '🌧️',
        'Windy': '💨'
    };
    return iconMap[condition] || '🌤️';
}

// Wetterdaten formatieren
function formatWindDirection(direction) {
    const directionMap = {
        'N': 'Norden',
        'NE': 'Nord-Osten',
        'E': 'Osten',
        'SE': 'Süd-Osten',
        'S': 'Süden',
        'SW': 'Süd-West',
        'W': 'Westen',
        'NW': 'Nord-West'
    };
    return directionMap[direction] || direction;
}

// Wetterdaten anzeigen
function displayWeather(data) {
    if (!elements.location) return;

    elements.location.textContent = data.location;
    elements.windSpeed.textContent = `${data.wind.speed} km/h`;
    elements.windDirection.textContent = formatWindDirection(data.wind.direction);
    elements.temperature.textContent = `${data.temperature}°C`;
    elements.humidity.textContent = `${data.humidity}%`;
    elements.pressure.textContent = `${data.pressure} hPa`;
    elements.conditions.textContent = data.conditions;

    // Icon setzen
    const iconElement = document.querySelector('.weather-icon');
    if (iconElement) {
        iconElement.textContent = getWeatherIcon(data.conditions);
    }
}

// Vorhersage anzeigen
function displayForecast(forecast) {
    const forecastContainer = document.getElementById('forecast');
    if (!forecastContainer) return;

    forecastContainer.innerHTML = forecast.map(day => `
        <div class="forecast-day">
            <span class="day-name">${day.day}</span>
            <span class="wind">${day.wind}</span>
            <span class="temp">${day.temp}</span>
        </div>
    `).join('');
}

// Simulierte Wetterdaten aktualisieren (für Demo)
function updateWeather() {
    // In einer echten Anwendung würde hier eine API-Anfrage stattfinden
    console.log('Wetterdaten aktualisiert');
    
    // Beispiel: Zufällige Windgeschwindigkeit für Demo
    const randomWind = Math.floor(Math.random() * 20) + 5;
    weatherData.wind.speed = randomWind;
    
    if (elements.windSpeed) {
        elements.windSpeed.textContent = `${randomWind} km/h`;
    }
}

// Segel-Bewertung berechnen
function calculateSailingRating(windSpeed, conditions) {
    let rating = 0;
    
    // Windgeschwindigkeit (idealerweise 10-25 km/h)
    if (windSpeed >= 10 && windSpeed <= 25) {
        rating += 3;
    } else if (windSpeed > 25) {
        rating += 1; // Zu stark
    } else {
        rating += 2; // Zu schwach
    }
    
    // Wetterbedingungen
    if (conditions === 'Sunny' || conditions === 'Partly Cloudy') {
        rating += 2;
    } else if (conditions === 'Windy') {
        rating += 1;
    } else {
        rating -= 1; // Regen oder Bewölkt
    }
    
    return Math.max(0, Math.min(5, rating));
}

// Bewertung anzeigen
function displaySailingRating(windSpeed, conditions) {
    const rating = calculateSailingRating(windSpeed, conditions);
    const ratingElement = document.getElementById('sailing-rating');
    
    if (ratingElement) {
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        ratingElement.innerHTML = `Segel-Bewertung: ${stars}`;
    }
}

// Initialisierung
document.addEventListener('DOMContentLoaded', function() {
    displayWeather(weatherData);
    displayForecast(weatherData.forecast);
    displaySailingRating(weatherData.wind.speed, weatherData.conditions);
    
    // Alle 5 Minuten aktualisieren (simuliert)
    setInterval(updateWeather, 300000);
});

// Export für Modul-Nutzung
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { weatherData, calculateSailingRating };
}