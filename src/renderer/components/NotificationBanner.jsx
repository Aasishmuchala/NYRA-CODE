/**
 * In-app notification banner — slides down from top when window is focused
 */
import React, { useEffect, useState } from 'react';
import { X, Bell, Download, AlertCircle } from 'lucide-react';
export const NotificationBanner = () => {
    const [banners, setBanners] = useState([]);
    const dismiss = (id) => setBanners(b => b.filter(x => x.id !== id));
    const push = (b) => {
        const id = `banner-${Date.now()}`;
        setBanners(prev => [...prev, { ...b, id }]);
        // Auto-dismiss info after 5s
        if (b.type === 'info')
            setTimeout(() => dismiss(id), 5000);
    };
    useEffect(() => {
        // In-app notification from main
        window.nyra.notify.onInApp(({ title, body }) => {
            push({ type: 'info', title, body });
        });
        // Update available
        window.nyra.updater.onAvailable((_info) => {
            push({
                type: 'update',
                title: 'Update available',
                body: `A new version of Nyra is downloading...`
            });
        });
        // Update ready to install
        window.nyra.updater.onReady(() => {
            push({
                type: 'update',
                title: 'Update ready',
                body: 'Restart Nyra to apply the update.',
                action: { label: 'Restart now', onClick: () => window.nyra.updater.install() }
            });
        });
    }, []);
    if (banners.length === 0)
        return null;
    const icons = { info: Bell, update: Download, error: AlertCircle };
    const colors = { info: 'border-white/10', update: 'border-terra-400/40', error: 'border-red-500/40' };
    const iconColors = { info: 'text-white/50', update: 'text-terra-400', error: 'text-red-400' };
    return (<div className="fixed top-10 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {banners.map(b => {
            const Icon = icons[b.type];
            return (<div key={b.id} className={`flex items-start gap-3 bg-[#1c1c1c] border ${colors[b.type]} rounded-xl px-4 py-3 shadow-2xl shadow-black/60 animate-in slide-in-from-top-2`}>
            <Icon size={15} className={`flex-shrink-0 mt-0.5 ${iconColors[b.type]}`}/>
            <div className="flex-1 min-w-0">
              <p className="text-white/90 text-xs font-semibold">{b.title}</p>
              <p className="text-white/40 text-xs mt-0.5 leading-snug">{b.body}</p>
              {b.action && (<button onClick={b.action.onClick} className="mt-2 text-xs text-terra-400 hover:text-terra-300 font-medium transition-colors">
                  {b.action.label}
                </button>)}
            </div>
            <button onClick={() => dismiss(b.id)} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0">
              <X size={13}/>
            </button>
          </div>);
        })}
    </div>);
};
