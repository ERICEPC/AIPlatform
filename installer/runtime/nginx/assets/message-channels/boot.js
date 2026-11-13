// Mark the embedded shell before first paint; forms load in channels.js.
if(new URLSearchParams(location.search).get('embedded')==='1'&&window.parent!==window)
  document.documentElement.dataset.embedded='true';
