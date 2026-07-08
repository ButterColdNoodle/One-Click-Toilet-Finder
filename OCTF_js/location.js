let myLocation = {
  latitude: null,
  longitude: null,
  accuracy: null,
  isReady: false
};

let map = null;
let userMarker = null;
let accuracyCircle = null;

function initMap() {
  if (map) {
    return map;
  }

  map = L.map("map");

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  return map;
}

function showUserOnMap(latitude, longitude, accuracy) {
  const userPosition = [latitude, longitude];

  initMap();

  map.setView(userPosition, 16);

  if (userMarker) {
    userMarker.setLatLng(userPosition);
  } else {
    userMarker = L.marker(userPosition).addTo(map);
  }


  if (Number.isFinite(accuracy)) {
    if (accuracyCircle) {
      accuracyCircle.setLatLng(userPosition);
      accuracyCircle.setRadius(accuracy);
    } else {
      accuracyCircle = L.circle(userPosition, {
        radius: accuracy
      }).addTo(map);
    }
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

function locateUser() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  } else {
    console.warn("This browser does not support location services.");
  }
}

function onSuccess(position) {
  myLocation.latitude = position.coords.latitude;
  myLocation.longitude = position.coords.longitude;
  myLocation.accuracy = position.coords.accuracy;
  myLocation.isReady = true;

  console.log("Location get!", myLocation);


  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude,
    myLocation.accuracy
  );
}

function onError(error) {
  let message = "";

  switch (error.code) {
    case error.PERMISSION_DENIED:
      message =
        "Location permission was denied. Please allow location access in your browser settings and reload the app.";
      break;

    case error.POSITION_UNAVAILABLE:
      message = "Location information is unavailable. Please reload the app later.";
      break;

    case error.TIMEOUT:
      message = "Location request timed out. Please reload the app and try again.";
      break;

    default:
      message = "Unknown location error. Please reload the app.";
      break;
  }

  updateStatus(message);
  alert(message);
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("App started. Requesting location automatically.");
  locateUser();
});