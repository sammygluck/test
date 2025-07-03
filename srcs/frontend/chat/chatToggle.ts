const chat = document.getElementById('chat-block') as HTMLElement | null;
const hideBtn = document.getElementById('chat-hide') as HTMLElement | null;
const toggleBtn = document.getElementById('chat-toggle') as HTMLElement | null;

function showChat(): void {
  if (!chat || !toggleBtn) return;
  chat.classList.remove('translate-y-full');
  chat.classList.add('md:translate-y-0');
  toggleBtn.classList.add('hidden');
}

function hideChat(): void {
  if (!chat || !toggleBtn) return;
  chat.classList.add('translate-y-full');
  chat.classList.remove('md:translate-y-0');
  toggleBtn.classList.remove('hidden');
}

if (window.innerWidth < 768) {
  hideChat();
} else {
  showChat();
}

hideBtn?.addEventListener('click', hideChat);
toggleBtn?.addEventListener('click', showChat);

window.addEventListener('resize', () => {
  if (window.innerWidth < 768 && chat && !chat.classList.contains('translate-y-full')) {
    hideChat();
  }
});
