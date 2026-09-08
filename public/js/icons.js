const shapes={
globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
plane:'<path d="M12 2 10 9 3 14v2l7-2-1 5-2 1v1l5-1 5 1v-1l-2-1-1-5 7 2v-2l-7-5-2-7Z"/>',
ship:'<path d="m3 12 9-3 9 3-3 7H6l-3-7ZM7 10V5h10v5M10 5V2h4v3M12 9v9M2 21q2-2 4 0t4 0 4 0 4 0 4 0"/>',
route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8"/>',
radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7M12 3v2M21 12h-2M12 21v-2M3 12h2"/><circle cx="12" cy="12" r="1"/>',
chart:'<path d="M4 3v17h17M8 15v-3M13 15V7M18 15v-5M7 8l5-4 6 2"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
wallet:'<path d="M3 6h17v14H3V6Zm0 0V4h14v2M16 11h5v5h-5v-5Z"/><path d="M18 13h.1"/>',
cloud:'<path d="M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11-1 5 5 0 1 1 0 11H7Z"/>',
wind:'<path d="M3 8h12c5 0 5-6 1-6M2 12h17c4 0 4 6 0 6M5 16h7c4 0 4 6 0 6"/>',
alert:'<path d="m12 3 10 17H2L12 3ZM12 9v5M12 17v.1"/>',
expand:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
plus:'<path d="M12 4v16M4 12h16"/>',
check:'<path d="m5 12 4 4L20 5"/>',
arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
export const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[name]||shapes.globe)+'</svg>';
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
