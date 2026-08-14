import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Backpack, Boxes, Link2, RefreshCw, ShoppingCart, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import './Inventory.css';

interface InventoryItem {
  _id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  quantity: number;
  externalItemType?: string;
  externalRarity?: string;
  isUsable: boolean;
}

interface GachaReward {
  itemId?: { _id?: string; name?: string; icon?: string; rarity?: string };
  amountByInventoryId?: Record<string, number[]>;
}

function Inventory() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingItemId, setUsingItemId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [warning, setWarning] = useState('');
  const [gachaResult, setGachaResult] = useState<{ message: string; rewards: GachaReward[] } | null>(null);
  const gachaDialogRef = useRef<HTMLElement | null>(null);
  const gachaOpenerRef = useRef<HTMLElement | null>(null);

  const loadInventory = async (refresh = false) => {
    try {
      setLoading(true);
      setWarning('');
      const response = await axios.get('/api/inventory', { params: refresh ? { refresh: 'true' } : undefined });
      if (response.data.success) {
        setItems(response.data.items || []);
        setLinked(Boolean(response.data.hamsterQuestLinked));
        setWarning(response.data.syncWarning || '');
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setWarning('Inventory is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadInventory(); }, []);

  useEffect(() => {
    if (!gachaResult) return;
    const dialog = gachaDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setGachaResult(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => gachaOpenerRef.current?.focus());
    };
  }, [gachaResult]);

  const linkHamsterQuest = async (providedUrl?: string) => {
    try {
      const url = providedUrl || (await axios.get('/api/inventory/hamsterquest/link-url')).data.url;
      if (url) window.location.assign(url);
    } catch {
      setWarning('Unable to start HamsterQuest login.');
    }
  };

  const useItem = async (item: InventoryItem) => {
    if (!item.isUsable || usingItemId) return;
    if (!linked) {
      await linkHamsterQuest();
      return;
    }
    gachaOpenerRef.current = document.activeElement as HTMLElement | null;
    try {
      setUsingItemId(item._id);
      const response = await axios.post(`/api/inventory/${item._id}/use`);
      setItems(response.data.items || []);
      if (response.data.itemType === 'GachaItem') {
        setGachaResult({ message: response.data.message || 'Gacha opened', rewards: response.data.result?.rewards || [] });
      } else {
        setWarning(response.data.message || 'Item used successfully.');
      }
    } catch (error: any) {
      if (error.response?.data?.code === 'HAMSTERQUEST_LINK_REQUIRED') {
        setLinked(false);
        await linkHamsterQuest(error.response.data.linkUrl);
        return;
      }
      setWarning(error.response?.data?.error || 'Unable to use this item.');
      await loadInventory();
    } finally {
      setUsingItemId(null);
    }
  };

  const rewardQuantity = (reward: GachaReward) =>
    Object.values(reward.amountByInventoryId || {}).flat().reduce((total, amount) => total + Number(amount || 0), 0);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <main className="inventory-page">
      <section className="inventory-window" aria-labelledby="inventory-title">
        <header className="inventory-hud">
          <button type="button" className="inventory-back" onClick={() => navigate('/mainmenu')} aria-label="Back to constellations"><ArrowLeft aria-hidden="true" /></button>
          <div className="inventory-brand"><span className="inventory-sigil" aria-hidden="true"><Backpack /></span><div><span>Player storage</span><h1 id="inventory-title">Inventory</h1></div></div>
          <div className="inventory-count"><Boxes aria-hidden="true" /><span>{itemCount}</span><small>items</small></div>
        </header>

        <div className="inventory-toolbar">
          <div><span>Stored provisions</span><h2>Your collection</h2></div>
          <button type="button" className="inventory-sync" onClick={() => void loadInventory(true)} disabled={loading}><RefreshCw aria-hidden="true" className={loading ? 'is-spinning' : ''} />{loading ? 'Syncing' : 'Sync'}</button>
        </div>

        {warning && <div className="inventory-notice" role="status">{warning}</div>}

        <div className="inventory-content">
          {loading ? <div className="inventory-empty" role="status"><RefreshCw className="is-spinning" aria-hidden="true" /><strong>Syncing inventory</strong></div>
            : items.length === 0 ? <div className="inventory-empty"><Boxes aria-hidden="true" /><strong>Storage is empty</strong><span>Items purchased from the shop will appear here.</span><button type="button" onClick={() => navigate('/shop')}><ShoppingCart aria-hidden="true" />Visit shop</button></div>
              : <div className="inventory-grid">{items.map(item => (
                <article className="inventory-card" key={item._id}>
                  <div className="inventory-media">{item.imageUrl ? <img src={item.imageUrl} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} /> : <Backpack aria-hidden="true" />}<strong>{item.quantity}</strong></div>
                  <div className="inventory-card-body"><div className="inventory-meta"><span>{item.externalRarity || 'Item'}</span>{item.externalItemType && <span>{item.externalItemType.replace('Item', '')}</span>}</div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.isUsable ? <button type="button" onClick={() => void useItem(item)} disabled={usingItemId !== null}>{!linked ? <Link2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{usingItemId === item._id ? 'Using...' : linked ? 'Use item' : 'Link to use'}</button> : <span className="inventory-stored">Stored</span>}</div>
                </article>
              ))}</div>}
        </div>
      </section>

      <nav className="inventory-dock" aria-label="Player navigation">
        <button type="button" onClick={() => navigate('/mainmenu')}><Sparkles aria-hidden="true" /><span>Constellations</span></button>
        <button type="button" className="is-active"><Backpack aria-hidden="true" /><span>Inventory</span></button>
        <button type="button" onClick={() => navigate('/shop')}><ShoppingCart aria-hidden="true" /><span>Shop</span></button>
      </nav>

      {gachaResult && <div className="inventory-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setGachaResult(null); }}><section ref={gachaDialogRef} className="inventory-gacha" role="dialog" aria-modal="true" aria-labelledby="inventory-gacha-title" tabIndex={-1}><header><div><span>Gacha result</span><h2 id="inventory-gacha-title">{gachaResult.message}</h2></div><button type="button" aria-label="Close gacha result" onClick={() => setGachaResult(null)}><X aria-hidden="true" /></button></header><div className="inventory-rewards">{gachaResult.rewards.length ? gachaResult.rewards.map((reward, index) => <article key={`${reward.itemId?._id || reward.itemId?.name || 'reward'}-${index}`}><div>{reward.itemId?.icon ? <img src={reward.itemId.icon} alt="" /> : <Sparkles aria-hidden="true" />}<strong>{Math.max(1, rewardQuantity(reward))}</strong></div><span>{reward.itemId?.rarity || 'Reward'}</span><h3>{reward.itemId?.name || 'Mystery reward'}</h3></article>) : <p>Reward added to your inventory.</p>}</div><button type="button" className="inventory-done" onClick={() => setGachaResult(null)}>Done</button></section></div>}
    </main>
  );
}

export default Inventory;
