import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Coins,
  ExternalLink,
  LockKeyhole,
  PenLine,
  RefreshCw,
  ShoppingBag,
  X
} from 'lucide-react';
import axios from '../config/axios';
import './MainMenu.css';
import './Shop.css';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  isAdmin: boolean;
  role: 'user' | 'admin' | 'super-admin';
}

interface ShopItem {
  _id: string;
  title: string;
  description?: string;
  price: number;
  imageUrl: string;
  isActive: boolean;
  itemType?: 'normal' | 'fiction';
  productData?: string;
  externalSource?: 'office-catalog';
  externalItemId?: string;
  externalItemType?: string;
  isPurchased?: boolean; // Recent purchase (within 5 min, for writing)
  hasEverPurchased?: boolean; // Any purchase (for reading)
  createdAt: string;
  updatedAt: string;
}

interface FictionContribution {
  _id: string;
  userId: string;
  user: {
    username: string;
    nickname?: string;
    discriminator: string;
    avatar: string | null;
  } | null;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

function Shop() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [assetPoints, setAssetPoints] = useState(0);
  const [assetPointName, setAssetPointName] = useState('Asset Point'); // Custom name from guild
  const [selectedFictionItem, setSelectedFictionItem] = useState<ShopItem | null>(null);
  const [fictionContributions, setFictionContributions] = useState<FictionContribution[]>([]);
  const [showFictionModal, setShowFictionModal] = useState(false);
  const [newContribution, setNewContribution] = useState('');
  const [writingLock, setWritingLock] = useState<{
    hasLock: boolean;
    isLocked: boolean;
    lockedBy?: string;
    expiresAt?: Date;
    timeRemaining?: number;
  } | null>(null);
  const lockCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fictionModalRef = useRef<HTMLDivElement | null>(null);
  const fictionModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const fictionModalOpenerRef = useRef<HTMLElement | null>(null);
  const purchaseOperationIdsRef = useRef(new Map<string, string>());
  const isClosingFictionModalRef = useRef(false);
  const isExternalInventoryItem = (item: ShopItem) => item.externalSource === 'office-catalog';

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadShopItems();
      loadUserStats();
    }
  }, [user]);

  // Reload user stats periodically to keep AP in sync
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      console.log('[Periodic Reload] Reloading user stats...');
      loadUserStats();
    }, 10000); // Reload every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.authenticated && response.data.user) {
        setUser(response.data.user);
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadShopItems = async () => {
    try {
      // The customer shop always applies the current user's guild scope, including for admins.
      const response = await axios.get('/api/shop/items');
      if (response.data.success) {
        setShopItems(response.data.items);
      }
    } catch (error) {
      console.error('Error loading shop items:', error);
    }
  };

  const loadUserStats = async () => {
    try {
      const response = await axios.get(`/api/users/${user?.id}`);
      if (response.data.success && response.data.user) {
        const newAP = response.data.user.assetPoints || 0;
        console.log('[loadUserStats] Loading user stats - Setting AP to:', newAP);
        setAssetPoints(newAP);
        // Set custom asset point name from guild
        if (response.data.user.assetPointName) {
          setAssetPointName(response.data.user.assetPointName);
        }
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const handlePurchase = async (item: ShopItem) => {
    console.log('handlePurchase called:', { 
      title: item.title, 
      itemType: item.itemType, 
      isPurchased: item.isPurchased,
      assetPoints,
      price: item.price
    });
    
    // Fiction and HamsterQuest inventory items can be purchased repeatedly.
    if (item.isPurchased && item.itemType !== 'fiction' && !isExternalInventoryItem(item)) {
      alert('You have already purchased this item!');
      return;
    }

    if (assetPoints < item.price) {
      alert(`Insufficient ${assetPointName}. You need ${item.price.toLocaleString()} ${assetPointName} but only have ${assetPoints.toLocaleString()} ${assetPointName}.`);
      return;
    }

    // Only show confirmation if not already in the modal (to avoid interrupting the flow)
    // If we're in the modal and user clicks purchase, proceed without confirmation
    const isInModal = selectedFictionItem && 
                      selectedFictionItem._id === item._id && 
                      showFictionModal;

    if (!isInModal) {
      fictionModalOpenerRef.current = document.activeElement as HTMLElement | null;
    }
    
    console.log('Purchase check:', { 
      isInModal, 
      selectedFictionItemId: selectedFictionItem?._id, 
      itemId: item._id, 
      showFictionModal 
    });
    
    if (!isInModal) {
      const purchaseMessage = item.isPurchased && (item.itemType === 'fiction' || item.itemType === undefined)
        ? `Repurchase "${item.title}" for ${item.price.toLocaleString()} ${assetPointName}? (This will open the fiction writing interface)`
        : item.isPurchased && isExternalInventoryItem(item)
          ? `Buy another "${item.title}" for ${item.price.toLocaleString()} ${assetPointName}?`
          : `Purchase "${item.title}" for ${item.price.toLocaleString()} ${assetPointName}?`;
      
      if (!confirm(purchaseMessage)) {
        return;
      }
    }

    try {
      console.log('Sending purchase request to backend...');
      const isExternalPurchase = isExternalInventoryItem(item);
      const operationStorageKey = `gugame-purchase-operation:${item._id}`;
      const operationId = isExternalPurchase
        ? purchaseOperationIdsRef.current.get(item._id) || sessionStorage.getItem(operationStorageKey) || crypto.randomUUID()
        : null;
      if (operationId) {
        purchaseOperationIdsRef.current.set(item._id, operationId);
        sessionStorage.setItem(operationStorageKey, operationId);
      }
      const response = await axios.post(
        `/api/shop/items/${item._id}/purchase`,
        undefined,
        operationId ? { headers: { 'Idempotency-Key': operationId } } : undefined
      );
      console.log('Purchase response:', response.data);

      if (response.status === 202 || response.data.pending) {
        alert(response.data.message || 'Purchase pending reconciliation. You will not be charged again.');
        return;
      }
      
      if (response.data.success) {
        if (operationId) {
          purchaseOperationIdsRef.current.delete(item._id);
          sessionStorage.removeItem(operationStorageKey);
        }
        console.log('[Frontend] Purchase successful - Response data:', response.data);
        console.log('[Frontend] Current asset points before update:', assetPoints);
        console.log('[Frontend] Item price:', item.price);
        console.log('[Frontend] RemainingAP from response:', response.data.remainingAP);
        
        // Update asset points immediately from response (most accurate)
        if (response.data.remainingAP !== undefined && response.data.remainingAP !== null) {
          console.log('[Frontend] Setting asset points to:', response.data.remainingAP);
          setAssetPoints(response.data.remainingAP);
        } else {
          // Fallback: calculate if response doesn't have remainingAP
          const newAssetPoints = Math.max(0, assetPoints - item.price);
          console.log('[Frontend] Response missing remainingAP, calculating:', newAssetPoints);
          setAssetPoints(newAssetPoints);
        }
        
        // Verify the update
        setTimeout(() => {
          console.log('[Frontend] Asset points after state update (checking in next render)');
        }, 0);
        
        // Handle different item types
        if (item.itemType === 'fiction' || item.itemType === undefined) {
          console.log('Fiction item purchased - updating state IMMEDIATELY');
          
          // CRITICAL: Update selectedFictionItem state IMMEDIATELY and SYNCHRONOUSLY
          // This must happen before any async operations to ensure UI updates instantly
          setSelectedFictionItem(prev => {
            // If we already have this item selected, update its purchase status
            if (prev && prev._id === item._id) {
              console.log('Updating existing selectedFictionItem with purchase status');
              return {
                ...prev,
                isPurchased: true, // After purchase, it's always purchased (within 5 min window)
                hasEverPurchased: true // After purchase, they've ever purchased
              };
            }
            // If we don't have this item selected yet, set it with purchase status
            console.log('Setting new selectedFictionItem with purchase status');
            return {
              ...item,
              isPurchased: true,
              hasEverPurchased: true
            };
          });
          
          // Always open the modal after purchase
          setShowFictionModal(true);
          
          // Reload data in background (non-blocking)
          // This ensures UI updates immediately while data refreshes
          // Use setTimeout to ensure state update happens first
          // Pass preservePurchaseStatus=true to prevent overwriting the purchase status
          setTimeout(() => {
            console.log('[Fiction Item] Reloading shop items and user stats after purchase...');
            Promise.all([
              loadShopItems(),
              loadUserStats(),
              loadFictionContributions(item._id, true) // Preserve purchase status
            ]).catch(err => console.error('Error reloading data:', err));
          }, 500); // Increased delay to 500ms to ensure DB update is complete
        } else {
          // For normal items: Show success message and reload stats
          if (item.itemType === 'normal' && response.data.productData) {
            alert(`Successfully purchased "${item.title}"!\n\nProduct: ${response.data.productData}`);
          } else {
            alert(`Successfully purchased "${item.title}"!\n\n${response.data.message || ''}`);
          }
          
          // Reload shop items and user stats to reflect the purchase
          // Delay longer to ensure database has been updated
          setTimeout(() => {
            console.log('[Normal Item] Reloading shop items and user stats after purchase...');
            Promise.all([
              loadShopItems(),
              loadUserStats()
            ]).catch(err => console.error('Error reloading data:', err));
          }, 500); // Increased delay to 500ms to ensure DB update is complete
        }
      }
    } catch (error: any) {
      console.error('Error purchasing item:', error);
      console.error('Error details:', error.response?.data);
      if (error.response?.data?.code === 'EXTERNAL_GRANT_REJECTED' || error.response?.data?.code === 'PURCHASE_ROLLED_BACK') {
        purchaseOperationIdsRef.current.delete(item._id);
        sessionStorage.removeItem(`gugame-purchase-operation:${item._id}`);
      }
      alert(error.response?.data?.error || 'Failed to purchase item');
    }
  };

  const loadFictionContributions = async (itemId: string, preservePurchaseStatus: boolean = false) => {
    try {
      const response = await axios.get(`/api/shop/items/${itemId}/fiction`);
      if (response.data.success) {
        setFictionContributions(response.data.contributions);
        // Update selectedFictionItem with latest purchase status
        // Use functional update to ensure we're working with the latest state
        setSelectedFictionItem(prev => {
          if (!prev || prev._id !== itemId) return prev;
          // If we just purchased, preserve the purchase status even if backend hasn't updated yet
          if (preservePurchaseStatus && prev.isPurchased) {
            return {
              ...prev,
              // Keep existing purchase status, but update other fields
              isPurchased: prev.isPurchased,
              hasEverPurchased: prev.hasEverPurchased
            };
          }
          return {
            ...prev,
            isPurchased: response.data.isPurchased !== undefined ? response.data.isPurchased : prev.isPurchased,
            hasEverPurchased: response.data.hasEverPurchased !== undefined ? response.data.hasEverPurchased : prev.hasEverPurchased
          };
        });
      }
    } catch (error) {
      console.error('Error loading fiction contributions:', error);
    }
  };

  const acquireWritingLock = async (itemId: string) => {
    try {
      const response = await axios.get(`/api/shop/items/${itemId}/fiction/writing-lock`);
      if (response.data.success) {
        // Update UI immediately with the response
        setWritingLock(response.data);
        
        // If user has the lock, start checking expiration
        if (response.data.hasLock && !response.data.isLocked) {
          // Clear any existing intervals
          if (lockCheckIntervalRef.current) {
            clearInterval(lockCheckIntervalRef.current);
          }
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
          }
          
          // Start timer countdown that updates every second
          if (response.data.expiresAt) {
            const expiresAt = new Date(response.data.expiresAt).getTime();
            const updateTimer = () => {
              const now = Date.now();
              const remaining = expiresAt - now;
              
              if (remaining <= 0) {
                // Timer expired
                setWritingLock(prev => prev ? { ...prev, timeRemaining: 0 } : null);
                if (timerIntervalRef.current) {
                  clearInterval(timerIntervalRef.current);
                  timerIntervalRef.current = null;
                }
                // Release lock
                releaseWritingLock(itemId);
              } else {
                // Update time remaining
                setWritingLock(prev => prev ? { ...prev, timeRemaining: remaining } : null);
              }
            };
            
            // Update immediately
            updateTimer();
            
            // Update every second
            const timerInterval = setInterval(updateTimer, 1000);
            timerIntervalRef.current = timerInterval;
          }
          
          // Start interval to check lock status every 10 seconds (for server sync)
          const interval = setInterval(async () => {
            try {
              const lockResponse = await axios.get(`/api/shop/items/${itemId}/fiction/writing-lock`);
              if (lockResponse.data.success) {
                // Update expiresAt if changed on server
                if (lockResponse.data.expiresAt) {
                  setWritingLock(lockResponse.data);
                }
                
                // If lock expired or was taken by someone else, clear interval
                if (!lockResponse.data.hasLock || lockResponse.data.isLocked) {
                  clearInterval(interval);
                  lockCheckIntervalRef.current = null;
                  if (timerIntervalRef.current) {
                    clearInterval(timerIntervalRef.current);
                    timerIntervalRef.current = null;
                  }
                }
              }
            } catch (error) {
              console.error('Error checking lock status:', error);
            }
          }, 10000); // Check every 10 seconds
          
          lockCheckIntervalRef.current = interval;
        } else if (response.data.isLocked) {
          // If locked by someone else, start polling to check when it becomes available
          if (lockCheckIntervalRef.current) {
            clearInterval(lockCheckIntervalRef.current);
          }
          
          const interval = setInterval(async () => {
            try {
              const lockResponse = await axios.get(`/api/shop/items/${itemId}/fiction/writing-lock`);
              if (lockResponse.data.success) {
                setWritingLock(lockResponse.data);
                
                // If lock becomes available or user gets it, update UI
                if (!lockResponse.data.isLocked) {
                  // Lock is now available or user got it
                  if (lockResponse.data.hasLock) {
                    // User now has the lock, start normal polling
                    clearInterval(interval);
                    lockCheckIntervalRef.current = null;
                    // Restart with normal polling
                    acquireWritingLock(itemId);
                  }
                }
              }
            } catch (error) {
              console.error('Error checking lock status:', error);
            }
          }, 5000); // Check every 5 seconds when waiting for lock
          
          lockCheckIntervalRef.current = interval;
        }
        
        return response.data;
      }
    } catch (error: any) {
      console.error('Error acquiring writing lock:', error);
      alert(error.response?.data?.error || 'Failed to acquire writing lock');
      return null;
    }
  };

  const releaseWritingLock = async (itemId: string) => {
    try {
      await axios.post(`/api/shop/items/${itemId}/fiction/release-lock`);
      // Update UI immediately
      setWritingLock(null);
      if (lockCheckIntervalRef.current) {
        clearInterval(lockCheckIntervalRef.current);
        lockCheckIntervalRef.current = null;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    } catch (error) {
      console.error('Error releasing writing lock:', error);
    }
  };

  const closeFictionModal = async () => {
    if (isClosingFictionModalRef.current) return;
    isClosingFictionModalRef.current = true;

    const itemId = selectedFictionItem?._id;
    const opener = fictionModalOpenerRef.current;

    if (lockCheckIntervalRef.current) {
      clearInterval(lockCheckIntervalRef.current);
      lockCheckIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setShowFictionModal(false);
    setSelectedFictionItem(null);
    setFictionContributions([]);
    setNewContribution('');
    setWritingLock(null);

    try {
      if (itemId) await releaseWritingLock(itemId);
    } finally {
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
        isClosingFictionModalRef.current = false;
      });
    }
  };

  useEffect(() => {
    if (!showFictionModal) return;

    const dialog = fictionModalRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => !element.hasAttribute('hidden'));

    document.body.style.overflow = 'hidden';
    fictionModalCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void closeFictionModal();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [showFictionModal]);

  const handleAddContribution = async () => {
    if (!selectedFictionItem || !newContribution.trim()) {
      alert('Please enter some content');
      return;
    }

    if (newContribution.trim().length > 100) {
      alert('Contribution must be 100 characters or less');
      return;
    }

    // Check if user has purchased this item
    if (!selectedFictionItem.isPurchased) {
      alert('You must purchase this item before contributing. Please purchase or repurchase to add another contribution.');
      return;
    }

    // Check if user has the writing lock
    if (!writingLock || !writingLock.hasLock || writingLock.isLocked) {
      alert('You do not have permission to write. Please acquire the writing lock first.');
      return;
    }

    // Check if lock is still valid
    if (writingLock.timeRemaining !== undefined && writingLock.timeRemaining <= 0) {
      alert('Your writing time has expired. Please acquire a new writing lock.');
      return;
    }

    try {
      const response = await axios.post(`/api/shop/items/${selectedFictionItem._id}/fiction/contribute`, {
        content: newContribution.trim()
      });
      if (response.data.success) {
        setNewContribution('');
        await loadFictionContributions(selectedFictionItem._id);
        alert('Contribution added successfully! To contribute again, you will need to repurchase this item.');
        
        // Release the writing lock after successful contribution
        await releaseWritingLock(selectedFictionItem._id);
        
        // After contributing, reload shop items to update purchase status
        await loadShopItems();
        // Update the selected item's purchase status
        if (selectedFictionItem) {
          const updatedItems = await axios.get('/api/shop/items');
          if (updatedItems.data.success) {
            const updatedItem = updatedItems.data.items.find((i: ShopItem) => i._id === selectedFictionItem._id);
            if (updatedItem) {
              setSelectedFictionItem(updatedItem);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error adding contribution:', error);
      if (error.response?.data?.error?.includes('lock') || error.response?.data?.error?.includes('permission')) {
        alert(error.response?.data?.error || 'You do not have permission to write. Only one user can write at a time.');
        // Refresh lock status
        if (selectedFictionItem) {
          await acquireWritingLock(selectedFictionItem._id);
        }
      } else if (error.response?.data?.error?.includes('repurchase') || error.response?.data?.error?.includes('purchase')) {
        alert('You must repurchase this item to contribute again. Each contribution requires a new purchase.');
        // Reload shop items to update purchase status
        await loadShopItems();
        if (selectedFictionItem) {
          const updatedItems = await axios.get('/api/shop/items');
          if (updatedItems.data.success) {
            const updatedItem = updatedItems.data.items.find((i: ShopItem) => i._id === selectedFictionItem._id);
            if (updatedItem) {
              setSelectedFictionItem(updatedItem);
            }
          }
        }
      } else {
        alert(error.response?.data?.error || 'Failed to add contribution');
      }
    }
  };

  const handleViewFiction = async (item: ShopItem) => {
    fictionModalOpenerRef.current = document.activeElement as HTMLElement | null;
    setSelectedFictionItem(item);
    await loadFictionContributions(item._id);
    setShowFictionModal(true);
  };

  const handleItemAction = (item: ShopItem) => {
    if (item.itemType === 'normal' && item.isPurchased && item.productData) {
      window.open(item.productData, '_blank');
    } else if (item.itemType === 'fiction' || item.itemType === undefined) {
      if (item.hasEverPurchased && !item.isPurchased) {
        handleViewFiction(item);
      } else if (item.isPurchased && assetPoints < item.price) {
        handleViewFiction(item);
      } else {
        handlePurchase(item);
      }
    } else {
      handlePurchase(item);
    }
  };

  const isItemActionDisabled = (item: ShopItem) => {
    const isFiction = item.itemType === 'fiction' || item.itemType === undefined;

    // Fiction remains readable after the first purchase, even without enough
    // balance for another writing pass.
    if (isFiction && item.hasEverPurchased) return false;
    if (item.itemType === 'normal' && item.isPurchased && item.productData) return false;
    if (item.isPurchased && item.itemType === 'normal' && !isExternalInventoryItem(item)) return true;

    return !item.isActive || assetPoints < item.price;
  };

  const formatLockTime = (milliseconds: number) =>
    Math.floor(milliseconds / 1000 / 60) + ':' +
    String(Math.floor((milliseconds / 1000) % 60)).padStart(2, '0');

  if (loading) {
    return (
      <div className="shop-loading" role="status">
        <span className="shop-loading-mark" aria-hidden="true" />
        Loading shop
      </div>
    );
  }

  return (
    <main className="shop-page">
      <section className="shop-window" aria-labelledby="shop-title">
        <header className="shop-hud">
          <button className="shop-back" type="button" onClick={() => navigate('/mainmenu')}>
            <ArrowLeft aria-hidden="true" size={18} />
            <span>Constellations</span>
          </button>

          <div className="shop-brand">
            <span className="shop-sigil" aria-hidden="true" />
            <div>
              <span className="shop-kicker">GuGame Exchange</span>
              <h1 id="shop-title">Starbound Shop</h1>
            </div>
          </div>

          <div className="shop-balance" aria-label={'Balance: ' + assetPoints.toLocaleString() + ' ' + assetPointName}>
            <Coins aria-hidden="true" size={18} />
            <span>Balance</span>
            <strong>{assetPoints.toLocaleString()}</strong>
            <small>{assetPointName}</small>
          </div>
        </header>

        <div className="shop-section-heading">
          <div>
            <span className="shop-kicker">Available provisions</span>
            <h2>Exchange inventory</h2>
          </div>
          <span className="shop-item-count">
            {shopItems.length} {shopItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="shop-items-container">
          {shopItems.length === 0 ? (
            <div className="empty-shop">
              <ShoppingBag aria-hidden="true" size={34} />
              <h2>Inventory unavailable</h2>
              <p>New provisions will appear here when the exchange is restocked.</p>
            </div>
          ) : (
            <div className="shop-items-grid">
              {shopItems.map((item) => {
                const isFiction = item.itemType === 'fiction' || item.itemType === undefined;
                const canAfford = assetPoints >= item.price;
                const isDisabled = isItemActionDisabled(item);
                const status = !item.isActive
                  ? 'Inactive'
                  : item.isPurchased && isFiction
                    ? 'Writing pass active'
                    : item.isPurchased
                      ? 'Owned'
                      : isFiction && item.hasEverPurchased
                        ? 'Reading unlocked'
                        : canAfford
                          ? 'Available'
                          : 'Insufficient balance';
                const stateClass = !item.isActive
                  ? 'is-inactive'
                  : item.isPurchased
                    ? 'is-purchased'
                    : canAfford
                      ? 'is-available'
                      : 'is-unaffordable';
                const actionLabel = item.isPurchased
                  ? isFiction
                    ? canAfford ? 'Repurchase and write' : 'Read fiction'
                    : item.itemType === 'normal' && item.productData
                      ? 'View product'
                      : isExternalInventoryItem(item) ? 'Buy another' : 'Purchased'
                  : isFiction && item.hasEverPurchased
                    ? 'Read fiction'
                    : !item.isActive
                      ? 'Unavailable'
                      : canAfford
                        ? isFiction ? 'Buy and write' : 'Purchase'
                        : 'Need ' + (item.price - assetPoints).toLocaleString() + ' more';

                return (
                  <article key={item._id} className={'shop-item-card ' + stateClass}>
                    <div className="shop-item-media">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        onError={(event) => {
                          event.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23111a2d"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca9bd" font-size="16">No image</text></svg>';
                        }}
                      />
                      <span className="shop-item-status">
                        <span aria-hidden="true" />
                        {status}
                      </span>
                    </div>

                    <div className="shop-item-body">
                      <div className="shop-item-heading">
                        <span className="shop-item-type">
                          {isFiction ? 'Collaborative fiction' : isExternalInventoryItem(item) ? 'Inventory item' : 'Provision'}
                        </span>
                        <h3 className="shop-item-title">{item.title}</h3>
                      </div>

                      {item.description && (
                        <p className="shop-item-description">{item.description}</p>
                      )}

                      <div className="shop-item-footer">
                        <div className="shop-item-price">
                          <span>Price</span>
                          <strong>{item.price.toLocaleString()}</strong>
                          <small>{assetPointName}</small>
                        </div>
                        <button
                          type="button"
                          className={'shop-item-button ' + (isFiction && item.hasEverPurchased && !item.isPurchased ? 'is-secondary' : '')}
                          onClick={() => handleItemAction(item)}
                          disabled={isDisabled}
                        >
                          {item.isPurchased && !isFiction && item.productData ? <ExternalLink aria-hidden="true" size={17} />
                            : isFiction && item.hasEverPurchased && !item.isPurchased ? <BookOpen aria-hidden="true" size={17} />
                            : item.isPurchased && isFiction ? <RefreshCw aria-hidden="true" size={17} />
                            : item.isPurchased ? <Check aria-hidden="true" size={17} />
                            : <ShoppingBag aria-hidden="true" size={17} />}
                          <span>{actionLabel}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {showFictionModal && selectedFictionItem && (
        <div
          className="modal-overlay fiction-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void closeFictionModal();
          }}
        >
          <div
            ref={fictionModalRef}
            className="modal-content fiction-modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fiction-modal-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="fiction-modal-header">
              <div>
                <span className="shop-kicker">Collaborative archive</span>
                <h3 id="fiction-modal-title">{selectedFictionItem.title}</h3>
                <p>
                  {fictionContributions.length} {fictionContributions.length === 1 ? 'entry' : 'entries'} in this chronicle
                </p>
              </div>
              <button
                ref={fictionModalCloseRef}
                type="button"
                className="fiction-modal-close"
                aria-label="Close fiction"
                title="Close"
                onClick={() => void closeFictionModal()}
              >
                <X aria-hidden="true" size={22} strokeWidth={2} />
              </button>
            </div>

            <div className="fiction-dialog-balance">
              <span>Available balance</span>
              <strong>{assetPoints.toLocaleString()} {assetPointName}</strong>
            </div>

            <section className="fiction-archive" aria-label="Fiction contributions">
              {fictionContributions.length === 0 ? (
                <p className="fiction-empty">No entries yet. The first line is waiting to be written.</p>
              ) : (
                <div className="fiction-contribution-list">
                  {fictionContributions.map((contrib) => (
                    <article key={contrib._id} className="fiction-contribution">
                      <header>
                        <img
                          src={contrib.user?.avatar
                            ? 'https://cdn.discordapp.com/avatars/' + contrib.userId + '/' + contrib.user.avatar + '.png'
                            : 'https://cdn.discordapp.com/embed/avatars/' + (Math.abs(parseInt(contrib.userId, 10)) % 5) + '.png'}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.src = 'https://cdn.discordapp.com/embed/avatars/' + (Math.abs(parseInt(contrib.userId, 10)) % 5) + '.png';
                          }}
                        />
                        <div>
                          <strong>
                            {contrib.user?.nickname || contrib.user?.username || 'Unknown User'}
                            {contrib.user?.discriminator && <span>#{contrib.user.discriminator}</span>}
                          </strong>
                          <time dateTime={contrib.createdAt}>
                            {new Date(contrib.createdAt).toLocaleString()}
                          </time>
                        </div>
                      </header>
                      <p>{contrib.content}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {selectedFictionItem.hasEverPurchased && !selectedFictionItem.isPurchased && (
              <div className="fiction-notice is-gold fiction-repurchase">
                <div>
                  <strong>Writing requires a new passage token</strong>
                  <p>Repurchase this fiction to open the writing interface again.</p>
                </div>
                <button
                  type="button"
                  className="fiction-action-button"
                  aria-label={`Repurchase (${selectedFictionItem.price.toLocaleString()} ${assetPointName})`}
                  onClick={() => handlePurchase(selectedFictionItem)}
                  disabled={assetPoints < selectedFictionItem.price}
                >
                  <RefreshCw aria-hidden="true" size={17} />
                  Repurchase for {selectedFictionItem.price.toLocaleString()}
                </button>
              </div>
            )}

            <section
              className={'fiction-composer ' + (!selectedFictionItem.isPurchased ? 'is-locked' : '')}
              aria-labelledby="fiction-compose-title"
            >
              {!selectedFictionItem.isPurchased && !selectedFictionItem.hasEverPurchased ? (
                <div className="fiction-notice is-gold fiction-purchase-gate">
                  <div>
                    <strong id="fiction-compose-title">Purchase required to contribute</strong>
                    <p>Each contribution requires a new purchase. Reading remains available after your first purchase.</p>
                  </div>
                  <button
                    type="button"
                    className="fiction-action-button"
                    onClick={async (event) => {
                      const button = event.currentTarget;
                      const originalText = button.textContent;
                      button.disabled = true;
                      button.textContent = 'Processing...';
                      try {
                        await handlePurchase(selectedFictionItem);
                      } finally {
                        button.disabled = false;
                        button.textContent = originalText || 'Purchase';
                      }
                    }}
                    disabled={assetPoints < selectedFictionItem.price}
                  >
                    <ShoppingBag aria-hidden="true" size={17} />
                    Purchase for {selectedFictionItem.price.toLocaleString()}
                  </button>
                </div>
              ) : (
                <>
                  {writingLock && writingLock.isLocked && (
                    <div className="fiction-lock-status is-busy" role="status">
                      <LockKeyhole aria-hidden="true" size={19} />
                      <div>
                        <strong>Writing locked</strong>
                        <p>{writingLock.lockedBy ? writingLock.lockedBy + ' is currently writing.' : 'Another user is currently writing.'}</p>
                        {writingLock.timeRemaining !== undefined && writingLock.timeRemaining > 0 && (
                          <span>Available in {formatLockTime(writingLock.timeRemaining)}</span>
                        )}
                        {writingLock.timeRemaining !== undefined && writingLock.timeRemaining <= 0 && (
                          <span>Lock expired. Writing access can be requested again.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {writingLock && writingLock.hasLock && !writingLock.isLocked && (
                    <div className="fiction-lock-status is-yours" role="status">
                      <PenLine aria-hidden="true" size={19} />
                      <div>
                        <strong>Writing access active</strong>
                        {writingLock.timeRemaining !== undefined && writingLock.timeRemaining > 0 && (
                          <span>{formatLockTime(writingLock.timeRemaining)} remaining</span>
                        )}
                        {writingLock.timeRemaining !== undefined && writingLock.timeRemaining <= 0 && (
                          <span>Access expired. Request a new lock to continue.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {(!writingLock || !writingLock.hasLock || writingLock.isLocked) && selectedFictionItem.isPurchased && (
                    <div className="fiction-notice is-gold fiction-lock-request">
                      <div>
                        <strong>Request writing access</strong>
                        <p>One writer at a time. Access lasts five minutes.</p>
                      </div>
                      <button
                        type="button"
                        className="fiction-action-button"
                        onClick={async () => {
                          const result = await acquireWritingLock(selectedFictionItem._id);
                          if (result && result.isLocked) {
                            alert('Writing is currently locked by ' + (result.lockedBy || 'another user') + '. Please wait for the lock to expire.');
                          } else if (!result?.hasLock) {
                            alert('Failed to acquire writing lock. Please try again.');
                          }
                        }}
                        disabled={writingLock?.isLocked}
                      >
                        <LockKeyhole aria-hidden="true" size={17} />
                        Acquire lock
                      </button>
                    </div>
                  )}

                  <label id="fiction-compose-title" className="fiction-compose-label" htmlFor="fiction-contribution">
                    Write your contribution
                  </label>
                  <p className="fiction-compose-note">
                    After submitting, another contribution requires a new purchase.
                  </p>
                  <textarea
                    id="fiction-contribution"
                    value={newContribution}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.length <= 100) setNewContribution(value);
                    }}
                    placeholder="Continue the story..."
                    disabled={!selectedFictionItem.isPurchased || !writingLock || !writingLock.hasLock || writingLock.isLocked}
                    maxLength={100}
                  />
                  <div className="fiction-compose-footer">
                    <span className={newContribution.length === 100 ? 'is-limit' : ''}>
                      {newContribution.length}/100
                    </span>
                    <button
                      type="button"
                      className="fiction-submit"
                      onClick={handleAddContribution}
                      disabled={!newContribution.trim() || !selectedFictionItem.isPurchased || !writingLock?.hasLock || writingLock.isLocked}
                    >
                      <PenLine aria-hidden="true" size={17} />
                      Add contribution
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

export default Shop;
