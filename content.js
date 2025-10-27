(function () {
  const playerElement = document.querySelector('.video-js');
  const video = document.querySelector('video');
  if (!playerElement || !video) return;

  playerElement.classList.remove('vjs-liveui');

  const speedControl = playerElement.querySelector('.vjs-playback-rate');
  if (speedControl) {
    speedControl.classList.remove('vjs-hidden');
    speedControl.style.display = 'flex';

    let menu = speedControl.querySelector('.vjs-menu-content');
    if (!menu) {
      const menuWrapper = document.createElement('div');
      menuWrapper.className = 'vjs-menu';
      menu = document.createElement('ul');
      menu.className = 'vjs-menu-content';
      menuWrapper.appendChild(menu);
      speedControl.appendChild(menuWrapper);
    }

    menu.innerHTML = '';
    const rates = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.5];

    const updateLabel = (rate) => {
      const label = speedControl.querySelector('.vjs-playback-rate-value');
      if (label) label.textContent = `${rate}x`;
    };

    const applyRate = (rate) => {
      video.playbackRate = rate;
      updateLabel(rate);
      playerElement.classList.remove('vjs-user-inactive');
      playerElement.classList.add('vjs-user-active');
    };

    rates.forEach(rate => {
      const item = document.createElement('li');
      item.className = 'vjs-menu-item';
      item.role = 'menuitemradio';
      item.tabIndex = -1;
      item.innerHTML = `<span class="vjs-menu-item-text">${rate}x</span>`;
      item.addEventListener('click', () => applyRate(rate));
      menu.appendChild(item);
    });
  }
})();
