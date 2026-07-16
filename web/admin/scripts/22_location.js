const scheduleLocationEditorState = {
  locationRequired: false,
  googlePlaceId: '',
  displayName: '',
  formattedAddress: '',
  location: null,
  selector: null,
  selectorPromise: null,
  map: null,
  mapPromise: null,
  mapsLibrary: null,
  placesLibrary: null,
  selectionCircle: null,
  policyValid: true,
  attributions: []
};
const SCHEDULE_MAP_DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };
let scheduleModalPreviouslyFocusedElement = null;
let scheduleModalFocusReturnDateKey = '';

function resetSchedulePlaceSelector() {
  const host = document.getElementById('schedulePlaceAutocompleteHost');
  if (host) host.replaceChildren();
  scheduleLocationEditorState.selector = null;
}

function resetSchedulePlaceMapSelection() {
  if (scheduleLocationEditorState.selectionCircle) {
    scheduleLocationEditorState.selectionCircle.setMap(null);
  }
  scheduleLocationEditorState.selectionCircle = null;
  scheduleLocationEditorState.location = null;
}

function resetSchedulePlaceMap() {
  resetSchedulePlaceMapSelection();
  const host = document.getElementById('schedulePlaceMap');
  if (host) host.replaceChildren();
  scheduleLocationEditorState.map = null;
  scheduleLocationEditorState.mapPromise = null;
  scheduleLocationEditorState.mapsLibrary = null;
  scheduleLocationEditorState.placesLibrary = null;
}

function normalizeSchedulePlaceLocation(location) {
  if (!location) return null;
  const lat = typeof location.lat === 'function' ? location.lat() : Number(location.lat);
  const lng = typeof location.lng === 'function' ? location.lng() : Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function syncSchedulePlaceMapSelection() {
  const map = scheduleLocationEditorState.map;
  const location = normalizeSchedulePlaceLocation(scheduleLocationEditorState.location);
  if (!map || !location) return;

  const Circle = scheduleLocationEditorState.mapsLibrary && scheduleLocationEditorState.mapsLibrary.Circle;
  if (!scheduleLocationEditorState.selectionCircle && Circle) {
    scheduleLocationEditorState.selectionCircle = new Circle({
      map,
      center: location,
      radius: 18,
      clickable: false,
      strokeColor: '#2563eb',
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: '#60a5fa',
      fillOpacity: 0.42
    });
  } else if (scheduleLocationEditorState.selectionCircle) {
    scheduleLocationEditorState.selectionCircle.setMap(map);
    scheduleLocationEditorState.selectionCircle.setCenter(location);
  }
  map.panTo(location);
  map.setZoom(17);
}

function setSchedulePlaceStatus(message, isError) {
  const status = document.getElementById('schedulePlaceStatus');
  if (!status) return;
  status.textContent = String(message || '');
  status.style.color = isError ? '#fecaca' : '#cbd5e1';
}

function syncSchedulePlaceSelectorValue() {
  const selector = scheduleLocationEditorState.selector;
  if (!selector) return;
  const selectedText = scheduleLocationEditorState.displayName
    || scheduleLocationEditorState.formattedAddress
    || '';
  selector.value = selectedText;
}

function renderSchedulePlaceSelection() {
  const text = document.getElementById('schedulePlaceSelectionText');
  const attributionWrap = document.getElementById('schedulePlaceAttribution');
  const clearButton = document.getElementById('schedulePlaceClearBtn');
  if (!text) return;
  if (clearButton) clearButton.disabled = !scheduleLocationEditorState.googlePlaceId;
  if (!scheduleLocationEditorState.googlePlaceId) {
    text.textContent = '선택된 장소가 없습니다.';
  } else {
    const title = scheduleLocationEditorState.displayName || '등록된 Google 장소';
    const address = scheduleLocationEditorState.formattedAddress || `Place ID: ${scheduleLocationEditorState.googlePlaceId}`;
    text.textContent = `${title} · ${address}`;
  }

  if (!attributionWrap) return;
  attributionWrap.replaceChildren();
  const googleMaps = document.createElement('span');
  googleMaps.className = 'google-maps-attribution';
  googleMaps.setAttribute('translate', 'no');
  googleMaps.textContent = 'Google Maps';
  attributionWrap.appendChild(googleMaps);

  (scheduleLocationEditorState.attributions || []).forEach(item => {
    const provider = String(item && item.provider || '').trim();
    if (!provider || provider === 'Google') return;
    const separator = document.createElement('span');
    separator.textContent = '·';
    attributionWrap.appendChild(separator);

    const providerUri = String(item && item.providerURI || '').trim();
    if (/^https:\/\//i.test(providerUri)) {
      const link = document.createElement('a');
      link.className = 'google-maps-provider-link';
      link.href = providerUri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = provider;
      attributionWrap.appendChild(link);
      return;
    }
    const label = document.createElement('span');
    label.textContent = provider;
    attributionWrap.appendChild(label);
  });
}

function applySchedulePlaceDetails(place, expectedPlaceId) {
  if (scheduleLocationEditorState.googlePlaceId !== expectedPlaceId) return false;
  scheduleLocationEditorState.displayName = String(place && place.displayName || '').trim();
  scheduleLocationEditorState.formattedAddress = String(place && place.formattedAddress || '').trim();
  scheduleLocationEditorState.location = normalizeSchedulePlaceLocation(place && place.location);
  scheduleLocationEditorState.attributions = Array.isArray(place && place.attributions) ? place.attributions.slice() : [];
  renderSchedulePlaceSelection();
  syncSchedulePlaceSelectorValue();
  syncSchedulePlaceMapSelection();
  return true;
}

async function hydrateSavedSchedulePlaceDetails(placesLibrary, placeId) {
  const expectedPlaceId = String(placeId || '').trim();
  if (!expectedPlaceId || !placesLibrary || !placesLibrary.Place) return;
  try {
    const place = new placesLibrary.Place({ id: expectedPlaceId });
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
    if (!applySchedulePlaceDetails(place, expectedPlaceId)) return;
    if (scheduleLocationEditorState.policyValid) {
      setSchedulePlaceStatus('저장된 Google 장소 정보를 확인했습니다.', false);
    }
  } catch (error) {
    if (scheduleLocationEditorState.googlePlaceId !== expectedPlaceId) return;
    renderSchedulePlaceSelection();
    if (scheduleLocationEditorState.policyValid) {
      setSchedulePlaceStatus('저장된 장소의 세부정보를 불러오지 못했습니다. Place ID는 유지됩니다.', true);
    }
  }
}

async function handleSchedulePlacePredictionSelected(event) {
  try {
    setSchedulePlaceStatus('선택한 장소 정보를 확인하고 있습니다.', false);
    const prediction = event && event.placePrediction;
    if (!prediction) throw new Error('장소 선택 결과가 없습니다.');
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] });
    const placeId = String(place.id || prediction.placeId || '').trim();
    if (!placeId) throw new Error('Google Place ID를 확인할 수 없습니다.');
    scheduleLocationEditorState.googlePlaceId = placeId;
    scheduleLocationEditorState.displayName = String(place.displayName || '').trim();
    scheduleLocationEditorState.formattedAddress = String(place.formattedAddress || '').trim();
    scheduleLocationEditorState.location = normalizeSchedulePlaceLocation(place.location);
    scheduleLocationEditorState.attributions = Array.isArray(place.attributions) ? place.attributions.slice() : [];
    scheduleLocationEditorState.policyValid = true;
    renderSchedulePlaceSelection();
    syncSchedulePlaceSelectorValue();
    syncSchedulePlaceMapSelection();
    setSchedulePlaceStatus('장소가 선택되었습니다. 저장 시 서버에서 위치를 다시 검증합니다.', false);
    updateScheduleCalendarModalPreview();
  } catch (error) {
    setSchedulePlaceStatus(getDisplayErrorMessage(error, '장소 정보를 확인하지 못했습니다.'), true);
  }
}

async function handleSchedulePlaceMapClick(event) {
  const placeId = String(event && event.placeId || '').trim();
  if (!placeId) {
    setSchedulePlaceStatus('지도에서는 장소 이름이 표시된 핀을 누르거나 위 검색창에서 주소를 선택해 주세요.', false);
    return;
  }
  if (event && typeof event.stop === 'function') event.stop();

  try {
    setSchedulePlaceStatus('지도에서 선택한 장소를 확인하고 있습니다.', false);
    const placesLibrary = scheduleLocationEditorState.placesLibrary
      || (await AdminRuntimeDeps.ensureGoogleMaps()).placesLibrary;
    const place = new placesLibrary.Place({ id: placeId });
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] });
    scheduleLocationEditorState.googlePlaceId = String(place.id || placeId).trim();
    scheduleLocationEditorState.displayName = String(place.displayName || '').trim();
    scheduleLocationEditorState.formattedAddress = String(place.formattedAddress || '').trim();
    scheduleLocationEditorState.location = normalizeSchedulePlaceLocation(place.location);
    scheduleLocationEditorState.attributions = Array.isArray(place.attributions) ? place.attributions.slice() : [];
    scheduleLocationEditorState.policyValid = true;
    renderSchedulePlaceSelection();
    syncSchedulePlaceSelectorValue();
    syncSchedulePlaceMapSelection();
    setSchedulePlaceStatus('지도에서 장소를 선택했습니다. 저장 시 서버에서 위치를 다시 검증합니다.', false);
    updateScheduleCalendarModalPreview();
  } catch (error) {
    setSchedulePlaceStatus(getDisplayErrorMessage(error, '지도에서 선택한 장소를 확인하지 못했습니다.'), true);
  }
}

async function ensureSchedulePlaceMap() {
  if (scheduleLocationEditorState.map) return scheduleLocationEditorState.map;
  if (scheduleLocationEditorState.mapPromise) return scheduleLocationEditorState.mapPromise;

  scheduleLocationEditorState.mapPromise = AdminRuntimeDeps.ensureGoogleMaps()
    .then(({ mapsLibrary, placesLibrary }) => {
      const host = document.getElementById('schedulePlaceMap');
      if (!host) throw new Error('장소 지도 영역을 찾을 수 없습니다.');
      const map = new mapsLibrary.Map(host, {
        center: SCHEDULE_MAP_DEFAULT_CENTER,
        zoom: 12,
        clickableIcons: true,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative'
      });
      map.addListener('click', event => handleSchedulePlaceMapClick(event));
      scheduleLocationEditorState.map = map;
      scheduleLocationEditorState.mapsLibrary = mapsLibrary;
      scheduleLocationEditorState.placesLibrary = placesLibrary;
      syncSchedulePlaceMapSelection();
      return map;
    })
    .catch(error => {
      setSchedulePlaceStatus(getDisplayErrorMessage(error, 'Google 지도를 불러오지 못했습니다.'), true);
      throw error;
    })
    .finally(() => {
      scheduleLocationEditorState.mapPromise = null;
    });
  return scheduleLocationEditorState.mapPromise;
}

async function ensureSchedulePlaceSelector() {
  if (scheduleLocationEditorState.selector) return scheduleLocationEditorState.selector;
  if (scheduleLocationEditorState.selectorPromise) return scheduleLocationEditorState.selectorPromise;

  scheduleLocationEditorState.selectorPromise = AdminRuntimeDeps.ensureGoogleMapsPlaces()
    .then(placesLibrary => {
      const host = document.getElementById('schedulePlaceAutocompleteHost');
      if (!host) throw new Error('장소 검색 입력 영역을 찾을 수 없습니다.');
      const selector = new placesLibrary.PlaceAutocompleteElement();
      selector.placeholder = '장소명 또는 주소 검색';
      selector.setAttribute('aria-label', 'Google 장소 검색');
      selector.addEventListener('gmp-select', handleSchedulePlacePredictionSelected);
      host.replaceChildren(selector);
      scheduleLocationEditorState.selector = selector;
      syncSchedulePlaceSelectorValue();
      if (scheduleLocationEditorState.policyValid) {
        setSchedulePlaceStatus('검색 결과에서 실제 장소를 선택해 주세요.', false);
      }
      if (scheduleLocationEditorState.googlePlaceId && !scheduleLocationEditorState.displayName) {
        hydrateSavedSchedulePlaceDetails(placesLibrary, scheduleLocationEditorState.googlePlaceId);
      }
      return selector;
    })
    .catch(error => {
      setSchedulePlaceStatus(getDisplayErrorMessage(error, 'Google 장소 검색을 불러오지 못했습니다.'), true);
      throw error;
    })
    .finally(() => {
      scheduleLocationEditorState.selectorPromise = null;
    });
  return scheduleLocationEditorState.selectorPromise;
}

function onScheduleLocationRequiredChanged() {
  const input = document.getElementById('scheduleLocationRequiredInput');
  const fields = document.getElementById('scheduleLocationFields');
  const policyDetails = document.getElementById('scheduleLocationPolicyDetails');
  const modalPanel = document.querySelector('#scheduleCalendarModal .schedule-calendar-location-modal');
  scheduleLocationEditorState.locationRequired = !!(input && input.checked);
  if (fields) fields.hidden = !scheduleLocationEditorState.locationRequired;
  if (policyDetails) policyDetails.hidden = !scheduleLocationEditorState.locationRequired;
  if (modalPanel) modalPanel.classList.toggle('is-location-disabled', !scheduleLocationEditorState.locationRequired);
  if (scheduleLocationEditorState.locationRequired) {
    Promise.all([ensureSchedulePlaceSelector(), ensureSchedulePlaceMap()]).catch(() => {});
  } else {
    scheduleLocationEditorState.googlePlaceId = '';
    scheduleLocationEditorState.displayName = '';
    scheduleLocationEditorState.formattedAddress = '';
    scheduleLocationEditorState.attributions = [];
    scheduleLocationEditorState.policyValid = true;
    resetSchedulePlaceMapSelection();
    resetSchedulePlaceSelector();
    renderSchedulePlaceSelection();
    setSchedulePlaceStatus('', false);
  }
  updateScheduleCalendarModalPreview();
}

function clearSchedulePlaceSelection() {
  scheduleLocationEditorState.googlePlaceId = '';
  scheduleLocationEditorState.displayName = '';
  scheduleLocationEditorState.formattedAddress = '';
  scheduleLocationEditorState.location = null;
  scheduleLocationEditorState.attributions = [];
  scheduleLocationEditorState.policyValid = true;
  resetSchedulePlaceMapSelection();
  renderSchedulePlaceSelection();
  setSchedulePlaceStatus('장소 선택이 해제되었습니다.', false);
  resetSchedulePlaceSelector();
  if (scheduleLocationEditorState.locationRequired) {
    ensureSchedulePlaceSelector().catch(() => {});
  }
  updateScheduleCalendarModalPreview();
}

function openScheduleLocationEditor(item) {
  const requiredInput = document.getElementById('scheduleLocationRequiredInput');
  const noteInput = document.getElementById('scheduleLocationNoteInput');
  const fields = document.getElementById('scheduleLocationFields');
  const policyDetails = document.getElementById('scheduleLocationPolicyDetails');
  const modalPanel = document.querySelector('#scheduleCalendarModal .schedule-calendar-location-modal');
  scheduleModalPreviouslyFocusedElement = document.activeElement;
  scheduleModalFocusReturnDateKey = String(scheduleCalendarModalState && scheduleCalendarModalState.dateKey || '');
  resetSchedulePlaceSelector();
  resetSchedulePlaceMap();
  scheduleLocationEditorState.locationRequired = item ? !!item.locationRequired : true;
  scheduleLocationEditorState.googlePlaceId = String(item && item.googlePlaceId || '').trim();
  scheduleLocationEditorState.displayName = '';
  scheduleLocationEditorState.formattedAddress = '';
  scheduleLocationEditorState.location = null;
  scheduleLocationEditorState.attributions = [];
  scheduleLocationEditorState.policyValid = item ? item.locationPolicyValid !== false : true;
  if (requiredInput) requiredInput.checked = scheduleLocationEditorState.locationRequired;
  if (noteInput) noteInput.value = String(item && item.locationNote || '');
  if (fields) fields.hidden = !scheduleLocationEditorState.locationRequired;
  if (policyDetails) policyDetails.hidden = !scheduleLocationEditorState.locationRequired;
  if (modalPanel) modalPanel.classList.toggle('is-location-disabled', !scheduleLocationEditorState.locationRequired);
  renderSchedulePlaceSelection();
  setSchedulePlaceStatus(
    scheduleLocationEditorState.policyValid ? '' : '저장된 장소 정책이 올바르지 않습니다. 장소를 다시 선택해 저장해 주세요.',
    !scheduleLocationEditorState.policyValid
  );
  if (scheduleLocationEditorState.locationRequired) {
    Promise.all([ensureSchedulePlaceSelector(), ensureSchedulePlaceMap()]).catch(() => {});
  }
}

function closeScheduleLocationEditor() {
  resetSchedulePlaceSelector();
  resetSchedulePlaceMap();
  setSchedulePlaceStatus('', false);
  const previous = scheduleModalPreviouslyFocusedElement;
  const returnDateKey = scheduleModalFocusReturnDateKey;
  scheduleModalPreviouslyFocusedElement = null;
  scheduleModalFocusReturnDateKey = '';
  setTimeout(() => {
    if (previous && previous.isConnected && typeof previous.focus === 'function') {
      previous.focus();
      return;
    }
    const fallback = returnDateKey
      ? document.querySelector(`.schedule-calendar-plus-btn[data-schedule-date-key="${returnDateKey}"]`)
      : null;
    if (fallback && typeof fallback.focus === 'function') fallback.focus();
  }, 0);
}

function handleScheduleLocationModalKeydown(event) {
  const modal = document.getElementById('scheduleCalendarModal');
  if (!modal || modal.style.display !== 'flex') return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeScheduleCalendarModal();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(modal.querySelectorAll('button, input, textarea, gmp-place-autocomplete, [tabindex]'))
    .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1' && element.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', handleScheduleLocationModalKeydown);

function validateScheduleLocationForm() {
  const eventNameInput = document.getElementById('scheduleEventNameInput');
  const eventName = String(eventNameInput && eventNameInput.value || '').trim();
  const noteInput = document.getElementById('scheduleLocationNoteInput');
  const note = String(noteInput && noteInput.value || '').trim();
  if (Array.from(eventName).length > 80 || /[\r\n\u0085\u2028\u2029]/.test(eventName)) {
    return { valid: false, message: '행사명은 줄바꿈 없이 80자 이내로 입력해 주세요.' };
  }
  if (note.length > 500) {
    return { valid: false, message: '장소 안내/회차 메모는 500자 이내로 입력해 주세요.' };
  }
  if (scheduleLocationEditorState.locationRequired && !scheduleLocationEditorState.googlePlaceId) {
    return { valid: false, message: '장소 기반 출석을 사용하려면 Google 검색 결과나 지도에서 장소를 선택해 주세요.' };
  }
  return { valid: true };
}

function getScheduleLocationSavePayload() {
  const eventNameInput = document.getElementById('scheduleEventNameInput');
  const noteInput = document.getElementById('scheduleLocationNoteInput');
  return {
    eventNameProvided: '1',
    eventName: String(eventNameInput && eventNameInput.value || '').trim(),
    locationPolicyPresent: '1',
    locationRequired: scheduleLocationEditorState.locationRequired ? '1' : '0',
    googlePlaceId: scheduleLocationEditorState.locationRequired ? scheduleLocationEditorState.googlePlaceId : '',
    radiusM: '500',
    locationNote: String(noteInput && noteInput.value || '').trim()
  };
}

function getScheduleLocationPreviewHtml() {
  const policy = scheduleLocationEditorState.locationRequired
    ? `필수 · 반경 500m · ${scheduleLocationEditorState.googlePlaceId ? '장소 선택됨' : '장소 미선택'}`
    : '사용 안 함';
  return `<br>장소 확인: ${escapeHtml(policy)}`;
}
