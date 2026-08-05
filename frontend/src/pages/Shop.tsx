import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
      const response = await axios.post(`/api/shop/items/${item._id}/purchase`);
      console.log('Purchase response:', response.data);
      
      if (response.data.success) {
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
            alert(`🎉 Successfully purchased "${item.title}"!\n\nProduct: ${response.data.productData}`);
          } else {
            alert(`🎉 Successfully purchased "${item.title}"!\n\n${response.data.message || ''}`);
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
    setSelectedFictionItem(item);
    await loadFictionContributions(item._id);
    setShowFictionModal(true);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '2rem'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        minHeight: 'calc(100vh - 40px)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '30px 40px',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          <button
            onClick={() => navigate('/mainmenu')}
            style={{
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              fontSize: '1.5rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'Dongle, sans-serif',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateX(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            ← Back
          </button>
          
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ 
                fontSize: '3.5rem', 
                fontWeight: '700', 
                margin: 0,
                fontFamily: 'Dongle, sans-serif',
                textShadow: '0 2px 10px rgba(0,0,0,0.2)'
              }}>
                🛒 Shop
              </h1>
              {(user?.role === 'admin' || user?.role === 'super-admin') && (
                <span style={{
                  padding: '4px 12px',
                  background: 'rgba(255, 255, 255, 0.3)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '12px',
                  fontSize: '1.2rem',
                  fontWeight: '600',
                  fontFamily: 'Dongle, sans-serif',
                  border: '2px solid rgba(255, 255, 255, 0.4)'
                }}>
                  👑 Admin
                </span>
              )}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              borderRadius: '20px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              fontSize: '1.6rem',
              fontWeight: '600',
              fontFamily: 'Dongle, sans-serif'
            }}>
              <span>💎</span>
              <span>{assetPoints.toLocaleString()} {assetPointName}</span>
            </div>
          </div>
          
          <div style={{ width: '100px' }}></div>
        </div>

        {/* Shop Items Grid */}
        <div style={{ 
          padding: '40px', 
          flex: 1,
          background: '#f8fafc'
        }}>
          {shopItems.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '80px 20px',
              background: 'white',
              borderRadius: '20px',
              border: '2px dashed #e5e7eb',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              <div style={{ 
                fontSize: '5rem', 
                marginBottom: '20px',
                filter: 'grayscale(0.3)'
              }}>
                🛒
              </div>
              <h2 style={{ 
                fontSize: '2.5rem', 
                color: '#374151', 
                marginBottom: '12px',
                fontFamily: 'Dongle, sans-serif',
                fontWeight: '700'
              }}>
                Shop is Empty
              </h2>
              <p style={{ 
                fontSize: '1.6rem', 
                color: '#6b7280',
                fontFamily: 'Dongle, sans-serif'
              }}>
                Check back later for new items!
              </p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: '28px' 
            }}>
              {shopItems.map((item) => (
                <div
                  key={item._id}
                  style={{
                    background: 'white',
                    borderRadius: '20px',
                    border: `3px solid ${item.isPurchased ? '#22c55e' : !item.isActive ? '#fbbf24' : assetPoints >= item.price ? '#e5e7eb' : '#f3f4f6'}`,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: ((assetPoints >= item.price && (!item.isPurchased || isExternalInventoryItem(item)) && item.isActive) || 
                             (item.isPurchased && (item.itemType === 'fiction' || item.itemType === undefined) && assetPoints >= item.price && item.isActive))
                             ? 'pointer' : 'default',
                    boxShadow: item.isPurchased 
                      ? '0 4px 20px rgba(34, 197, 94, 0.3)' 
                      : !item.isActive
                      ? '0 4px 15px rgba(251, 191, 36, 0.2)'
                      : assetPoints >= item.price
                      ? '0 4px 15px rgba(0,0,0,0.08)'
                      : '0 2px 8px rgba(0,0,0,0.05)',
                    position: 'relative',
                    opacity: !item.isActive ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (assetPoints >= item.price && !item.isPurchased && item.isActive) {
                      e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.25)';
                      e.currentTarget.style.borderColor = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = item.isPurchased 
                      ? '0 4px 20px rgba(34, 197, 94, 0.3)' 
                      : !item.isActive
                      ? '0 4px 15px rgba(251, 191, 36, 0.2)'
                      : assetPoints >= item.price
                      ? '0 4px 15px rgba(0,0,0,0.08)'
                      : '0 2px 8px rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = item.isPurchased ? '#22c55e' : !item.isActive ? '#fbbf24' : assetPoints >= item.price ? '#e5e7eb' : '#f3f4f6';
                  }}
                  onClick={() => {
                    // Allow purchase for unpurchased items
                    // Allow repurchase for Fiction items if user has enough AP
                    if (assetPoints >= item.price && item.isActive) {
                      if (!item.isPurchased || (item.itemType === 'fiction' || item.itemType === undefined) || isExternalInventoryItem(item)) {
                        handlePurchase(item);
                      }
                    }
                  }}
                >
                  {/* Purchased Badge */}
                  {item.isPurchased && (
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: '#22c55e',
                      color: 'white',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '1.2rem',
                      fontWeight: '600',
                      fontFamily: 'Dongle, sans-serif',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      ✓ Purchased
                    </div>
                  )}

                  {/* Item Image */}
                  <div style={{ 
                    position: 'relative', 
                    width: '100%', 
                    paddingBottom: '75%', 
                    background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                    overflow: 'hidden'
                  }}>
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        if (assetPoints >= item.price && !item.isPurchased) {
                          (e.target as HTMLImageElement).style.transform = 'scale(1.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLImageElement).style.transform = 'scale(1)';
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23f3f4f6"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="14">No Image</text></svg>';
                      }}
                    />
                    {item.isPurchased && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(34, 197, 94, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <div style={{
                          background: 'rgba(34, 197, 94, 0.9)',
                          color: 'white',
                          padding: '12px 24px',
                          borderRadius: '12px',
                          fontSize: '1.8rem',
                          fontWeight: '700',
                          fontFamily: 'Dongle, sans-serif',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                          ✓ Owned
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Item Info */}
                  <div style={{ 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '16px', 
                    flex: 1 
                  }}>
                    <div>
                      <h3 style={{ 
                        fontSize: '2rem', 
                        fontWeight: '700', 
                        color: '#14306d', 
                        marginBottom: '10px',
                        fontFamily: 'Dongle, sans-serif',
                        lineHeight: '1.2',
                        minHeight: '2.4rem'
                      }}>
                        {item.title}
                      </h3>
                      {item.description && (
                        <p style={{ 
                          fontSize: '1.4rem', 
                          color: '#6b7280', 
                          lineHeight: '1.6',
                          fontFamily: 'Dongle, sans-serif',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minHeight: '6.7rem'
                        }}>
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Price and Purchase Button */}
                    <div style={{ 
                      marginTop: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '14px',
                      paddingTop: '8px',
                      borderTop: '1px solid #f3f4f6'
                    }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{
                          fontSize: '1.4rem',
                          color: '#6b7280',
                          fontFamily: 'Dongle, sans-serif',
                          fontWeight: '600'
                        }}>
                          Price:
                        </span>
                        <div style={{ 
                          fontSize: '2.2rem', 
                          fontWeight: '700', 
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                          fontFamily: 'Dongle, sans-serif'
                        }}>
                          {item.price.toLocaleString()} {assetPointName}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Shop item button clicked:', {
                            itemId: item._id,
                            title: item.title,
                            itemType: item.itemType,
                            isPurchased: item.isPurchased,
                            assetPoints,
                            price: item.price,
                            isActive: item.isActive
                          });
                          
                          if (item.itemType === 'normal' && item.isPurchased && item.productData) {
                            // Show product data for normal items
                            window.open(item.productData, '_blank');
                          } else if ((item.itemType === 'fiction' || item.itemType === undefined)) {
                            // For fiction items:
                            // - If hasEverPurchased but not isPurchased: open to read
                            // - If isPurchased (recent): allow repurchase to write again
                            // - If not purchased at all: purchase to buy
                            if (item.hasEverPurchased && !item.isPurchased) {
                              // User has purchased before but purchase is old - open to read
                              console.log('Fiction item purchased before, opening to read');
                              handleViewFiction(item);
                            } else if (item.isPurchased) {
                              // Recent purchase - can write, but can also repurchase to write again
                              console.log('Fiction item recently purchased, checking if can repurchase...');
                              if (assetPoints >= item.price) {
                                console.log('User has enough AP, calling handlePurchase for repurchase');
                                // Repurchase - call handlePurchase
                                handlePurchase(item);
                              } else {
                                console.log('User does not have enough AP, opening view modal');
                                // If not enough AP, just open the view modal
                                handleViewFiction(item);
                              }
                            } else {
                              // First time purchase for fiction item
                              console.log('First time purchase for fiction item');
                              handlePurchase(item);
                            }
                          } else {
                            // Purchase new item (normal or other types)
                            console.log('Purchase new item');
                            handlePurchase(item);
                          }
                        }}
                        disabled={(() => {
                          const isDisabled = (item.isPurchased && item.itemType === 'normal' && !isExternalInventoryItem(item)) ||
                            (!item.isPurchased && (assetPoints < item.price || !item.isActive)) ||
                            (item.isPurchased && ((item.itemType === 'fiction' || item.itemType === undefined) || isExternalInventoryItem(item)) && (assetPoints < item.price || !item.isActive));
                          
                          // Only log if it's a purchased item to reduce console spam
                          if (item.isPurchased) {
                            console.log('Button disabled check for purchased item:', {
                              itemId: item._id,
                              title: item.title,
                              itemType: item.itemType,
                              isPurchased: item.isPurchased,
                              assetPoints,
                              price: item.price,
                              isActive: item.isActive,
                              isDisabled,
                              reason: item.isPurchased && item.itemType === 'normal' ? 'normal-purchased' :
                                     !item.isPurchased && (assetPoints < item.price || !item.isActive) ? 'not-purchased-no-ap-or-inactive' :
                                     item.isPurchased && (item.itemType === 'fiction' || item.itemType === undefined) && assetPoints < item.price ? 'fiction-purchased-no-ap' :
                                     'enabled'
                            });
                          }
                          
                          return isDisabled;
                        })()}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: item.isPurchased
                            ? ((item.itemType === 'fiction' || item.itemType === undefined) && assetPoints >= item.price
                                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                : '#22c55e')
                            : (item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased
                            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' // Blue for "Read" button
                            : !item.isActive
                            ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                            : assetPoints >= item.price
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            : '#d1d5db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '1.5rem',
                          fontWeight: '700',
                          cursor: (
                            (assetPoints >= item.price && !item.isPurchased && !item.hasEverPurchased && item.isActive) ||
                            (item.isPurchased && item.itemType === 'fiction' && assetPoints >= item.price && item.isActive) ||
                            (item.isPurchased && isExternalInventoryItem(item) && assetPoints >= item.price && item.isActive) ||
                            ((item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased && item.isActive)
                          ) ? 'pointer' : 'not-allowed',
                          fontFamily: 'Dongle, sans-serif',
                          transition: 'all 0.3s',
                          boxShadow: (
                            (assetPoints >= item.price && !item.isPurchased && !item.hasEverPurchased && item.isActive) ||
                            (item.isPurchased && (item.itemType === 'fiction' || item.itemType === undefined) && assetPoints >= item.price && item.isActive) ||
                            (item.isPurchased && isExternalInventoryItem(item) && assetPoints >= item.price && item.isActive) ||
                            ((item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased && item.isActive)
                          )
                            ? (item.isPurchased && (item.itemType === 'fiction' || item.itemType === undefined)
                                ? '0 4px 15px rgba(245, 158, 11, 0.4)'
                                : (item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased
                                ? '0 4px 15px rgba(59, 130, 246, 0.4)'
                                : '0 4px 15px rgba(102, 126, 234, 0.4)')
                            : 'none',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                          const canInteract = (assetPoints >= item.price && !item.isPurchased && !item.hasEverPurchased && item.isActive) ||
                                            (item.isPurchased && item.itemType === 'fiction' && assetPoints >= item.price && item.isActive) ||
                                            (item.isPurchased && isExternalInventoryItem(item) && assetPoints >= item.price && item.isActive) ||
                                            ((item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased && item.isActive);
                          if (canInteract) {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            const isReadButton = (item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased;
                            e.currentTarget.style.boxShadow = isReadButton
                              ? '0 6px 20px rgba(59, 130, 246, 0.5)'
                              : '0 6px 20px rgba(102, 126, 234, 0.5)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          const canInteract = (assetPoints >= item.price && !item.isPurchased && !item.hasEverPurchased && item.isActive) ||
                                            (item.isPurchased && item.itemType === 'fiction' && assetPoints >= item.price && item.isActive) ||
                                            (item.isPurchased && isExternalInventoryItem(item) && assetPoints >= item.price && item.isActive) ||
                                            ((item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased && item.isActive);
                          const isReadButton = (item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased && !item.isPurchased;
                          e.currentTarget.style.boxShadow = canInteract
                            ? (isReadButton
                                ? '0 4px 15px rgba(59, 130, 246, 0.4)'
                                : '0 4px 15px rgba(102, 126, 234, 0.4)')
                            : 'none';
                        }}
                      >
                        {item.isPurchased 
                          ? ((item.itemType === 'fiction' || item.itemType === undefined)
                              ? (assetPoints >= item.price 
                                  ? '🔄 Repurchase & Write' 
                                  : '📖 Read')
                              : item.itemType === 'normal' && item.productData
                              ? '🔗 View Product'
                              : isExternalInventoryItem(item)
                              ? 'Buy Another'
                              : '✓ Purchased')
                          : (item.itemType === 'fiction' || item.itemType === undefined) && item.hasEverPurchased
                          ? '📖 Read'
                          : !item.isActive
                          ? '⚠️ Inactive Item'
                          : assetPoints >= item.price 
                          ? (item.itemType === 'fiction' ? '🛒 Buy & Write' : '🛒 Purchase Now')
                          : `Need ${item.price - assetPoints} more ${assetPointName}`}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fiction Modal */}
      {showFictionModal && selectedFictionItem && (
        <div 
          className="modal-overlay" 
          onClick={async () => { 
            // Release writing lock when closing modal
            if (selectedFictionItem) {
              await releaseWritingLock(selectedFictionItem._id);
            }
            setShowFictionModal(false); 
            setSelectedFictionItem(null); 
            setFictionContributions([]); 
            setNewContribution('');
            setWritingLock(null);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '800px', 
              width: '100%',
              maxHeight: '90vh', 
              overflowY: 'auto',
              background: 'white',
              borderRadius: '16px',
              padding: '30px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <h3 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: '700', color: '#14306d' }}>
              📖 {selectedFictionItem.title}
            </h3>

            {/* Fiction Content Display */}
            <div style={{ marginBottom: '24px', padding: '20px', background: '#f9fafb', borderRadius: '12px', border: '2px solid #e5e7eb' }}>
              {fictionContributions.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '16px' }}>
                  No contributions yet. Be the first to write!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {fictionContributions.map((contrib) => (
                    <div
                      key={contrib._id}
                      style={{
                        padding: '16px',
                        background: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        {contrib.user?.avatar && (
                          <img
                            src={`https://cdn.discordapp.com/avatars/${contrib.userId}/${contrib.user.avatar}.png`}
                            alt={contrib.user.username}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              border: '2px solid #e5e7eb'
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(contrib.userId, 10)) % 5}.png`;
                            }}
                          />
                        )}
                        {!contrib.user?.avatar && (
                          <img
                            src={`https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(contrib.userId, 10)) % 5}.png`}
                            alt={contrib.user?.username || 'User'}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              border: '2px solid #e5e7eb'
                            }}
                          />
                        )}
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                            {contrib.user?.nickname || contrib.user?.username || 'Unknown User'}
                            {contrib.user?.discriminator && (
                              <span style={{ color: '#6b7280' }}>#{contrib.user.discriminator}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                            {new Date(contrib.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: '15px', 
                        color: '#374151', 
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {contrib.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Repurchase Button for Fiction Items - Only show if hasEverPurchased but not currently purchased */}
            {selectedFictionItem.hasEverPurchased && !selectedFictionItem.isPurchased && (
            <div style={{ 
              marginBottom: '20px',
              padding: '16px',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              borderRadius: '12px',
              border: '2px solid #fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#92400e', marginBottom: '4px' }}>
                  🔄 Want to Repurchase?
                </div>
                <div style={{ fontSize: '13px', color: '#78350f' }}>
                  Repurchase to open the writing interface again ({selectedFictionItem.price.toLocaleString()} {assetPointName})
                </div>
              </div>
              <button
                onClick={async () => {
                  if (assetPoints < selectedFictionItem.price) {
                    alert(`Insufficient ${assetPointName}. You need ${selectedFictionItem.price.toLocaleString()} ${assetPointName} but only have ${assetPoints.toLocaleString()} ${assetPointName}.`);
                    return;
                  }
                  // No confirmation needed - proceed directly with purchase
                  await handlePurchase(selectedFictionItem);
                }}
                disabled={assetPoints < selectedFictionItem.price}
                style={{
                  padding: '10px 20px',
                  background: assetPoints >= selectedFictionItem.price
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: assetPoints >= selectedFictionItem.price ? 'pointer' : 'not-allowed',
                  fontFamily: 'Dongle, sans-serif',
                  transition: 'all 0.3s',
                  whiteSpace: 'nowrap'
                }}
              >
                🔄 Repurchase ({selectedFictionItem.price.toLocaleString()} {assetPointName})
              </button>
            </div>
            )}

            {/* Add Contribution Form */}
            <div style={{ 
              marginTop: '24px', 
              padding: '20px', 
              background: !selectedFictionItem.isPurchased ? '#fef3c7' : '#f9fafb', 
              borderRadius: '12px',
              border: !selectedFictionItem.isPurchased ? '2px solid #fbbf24' : '2px solid #e5e7eb'
            }}>
              {!selectedFictionItem.isPurchased && !selectedFictionItem.hasEverPurchased ? (
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  borderRadius: '8px',
                  border: '2px solid #fbbf24',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>
                    💰 Purchase Required to Contribute
                  </div>
                  <div style={{ fontSize: '14px', color: '#78350f', marginBottom: '16px' }}>
                    To contribute to this fiction, you need to purchase or repurchase this item. Each contribution requires a new purchase.
                  </div>
                  <button
                    onClick={async () => {
                      if (assetPoints < selectedFictionItem.price) {
                        alert(`Insufficient ${assetPointName}. You need ${selectedFictionItem.price.toLocaleString()} ${assetPointName} but only have ${assetPoints.toLocaleString()} ${assetPointName}.`);
                        return;
                      }
                      
                      // Show loading state
                      const button = event?.currentTarget as HTMLButtonElement;
                      const originalText = button.textContent;
                      button.disabled = true;
                      button.textContent = 'Processing...';
                      
                      try {
                        await handlePurchase(selectedFictionItem);
                        // UI will update automatically via handlePurchase
                      } catch (error) {
                        // Error already handled in handlePurchase
                      } finally {
                        // Restore button state (though it should be updated by the purchase)
                        if (button) {
                          button.disabled = false;
                          button.textContent = originalText || '🛒 Purchase';
                        }
                      }
                    }}
                    disabled={assetPoints < selectedFictionItem.price}
                    style={{
                      padding: '12px 24px',
                      background: assetPoints >= selectedFictionItem.price
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : '#d1d5db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: '700',
                      cursor: assetPoints >= selectedFictionItem.price ? 'pointer' : 'not-allowed',
                      fontFamily: 'Dongle, sans-serif',
                      transition: 'all 0.3s'
                    }}
                  >
                    {selectedFictionItem.isPurchased ? '🔄 Repurchase' : '🛒 Purchase'} ({selectedFictionItem.price.toLocaleString()} {assetPointName})
                  </button>
                </div>
              ) : (
                <>
                  {/* Writing Lock Status */}
                  {writingLock && writingLock.isLocked && (
                    <div style={{
                      padding: '16px',
                      background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      borderRadius: '8px',
                      border: '2px solid #ef4444',
                      marginBottom: '16px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>
                        🔒 Writing Locked
                      </div>
                      <div style={{ fontSize: '14px', color: '#7f1d1d' }}>
                        {writingLock.lockedBy ? `${writingLock.lockedBy} is currently writing.` : 'Another user is currently writing.'}
                      </div>
                      {writingLock.timeRemaining !== undefined && writingLock.timeRemaining > 0 && (
                        <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '8px', fontWeight: '600' }}>
                          Lock expires in: {Math.floor(writingLock.timeRemaining / 1000 / 60)}:{String(Math.floor((writingLock.timeRemaining / 1000) % 60)).padStart(2, '0')}
                        </div>
                      )}
                      {writingLock.timeRemaining !== undefined && writingLock.timeRemaining <= 0 && (
                        <div style={{ fontSize: '13px', color: '#991b1b', marginTop: '8px', fontWeight: '600' }}>
                          ⚠️ Lock expired! You can now try to acquire the lock.
                        </div>
                      )}
                    </div>
                  )}
                  
                  {writingLock && writingLock.hasLock && !writingLock.isLocked && (
                    <div style={{
                      padding: '16px',
                      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                      borderRadius: '8px',
                      border: '2px solid #22c55e',
                      marginBottom: '16px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>
                        ✍️ You Have Writing Access
                      </div>
                      {writingLock.timeRemaining !== undefined && writingLock.timeRemaining > 0 && (
                        <div style={{ fontSize: '14px', color: '#14532d', fontWeight: '600' }}>
                          Time remaining: {Math.floor(writingLock.timeRemaining / 1000 / 60)}:{String(Math.floor((writingLock.timeRemaining / 1000) % 60)).padStart(2, '0')}
                        </div>
                      )}
                      {writingLock.timeRemaining !== undefined && writingLock.timeRemaining <= 0 && (
                        <div style={{ fontSize: '14px', color: '#991b1b', fontWeight: '600' }}>
                          ⚠️ Lock expired! Please acquire a new lock to continue writing.
                        </div>
                      )}
                    </div>
                  )}

                  {(!writingLock || !writingLock.hasLock || writingLock.isLocked) && selectedFictionItem.isPurchased && (
                    <div style={{
                      padding: '16px',
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '8px',
                      border: '2px solid #f59e0b',
                      marginBottom: '16px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>
                        🔓 Acquire Writing Lock
                      </div>
                      <div style={{ fontSize: '14px', color: '#78350f', marginBottom: '12px' }}>
                        Only one user can write at a time. Click below to acquire the writing lock (5 minutes).
                      </div>
                      <button
                        onClick={async () => {
                          if (selectedFictionItem) {
                            const result = await acquireWritingLock(selectedFictionItem._id);
                            if (result && result.isLocked) {
                              alert(`Writing is currently locked by ${result.lockedBy || 'another user'}. Please wait for the lock to expire.`);
                            } else if (result && result.hasLock) {
                              // Success - UI will update automatically via setWritingLock
                            } else {
                              alert('Failed to acquire writing lock. Please try again.');
                            }
                          }
                        }}
                        disabled={writingLock?.isLocked}
                        style={{
                          padding: '10px 20px',
                          background: writingLock?.isLocked 
                            ? '#d1d5db'
                            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '16px',
                          fontWeight: '700',
                          cursor: writingLock?.isLocked ? 'not-allowed' : 'pointer',
                          fontFamily: 'Dongle, sans-serif',
                          transition: 'all 0.3s',
                          opacity: writingLock?.isLocked ? 0.6 : 1
                        }}
                      >
                        🔓 Acquire Lock
                      </button>
                    </div>
                  )}

                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px', 
                    fontSize: '18px', 
                    fontWeight: '700', 
                    color: '#14306d',
                    fontFamily: 'Dongle, sans-serif'
                  }}>
                    ✍️ Write Your Contribution (Max 100 characters):
                  </label>
                  <div style={{
                    padding: '12px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: '#78350f',
                    border: '1px solid #fbbf24'
                  }}>
                    💡 <strong>Note:</strong> After contributing, you'll need to repurchase this item to contribute again.
                  </div>
                  <textarea
                    value={newContribution}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 100) {
                        setNewContribution(value);
                      }
                    }}
                    placeholder="Continue the story... Write your part of this collaborative fiction... (Max 100 characters)"
                    disabled={!selectedFictionItem.isPurchased || !writingLock || !writingLock.hasLock || writingLock.isLocked}
                    maxLength={100}
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      padding: '16px',
                      border: newContribution.length > 100 ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      lineHeight: '1.6',
                      transition: 'border-color 0.2s',
                      backgroundColor: !selectedFictionItem.isPurchased ? '#f3f4f6' : 'white',
                      cursor: !selectedFictionItem.isPurchased ? 'not-allowed' : 'text'
                    }}
                    onFocus={(e) => {
                      if (selectedFictionItem.isPurchased) {
                        e.currentTarget.style.borderColor = '#667eea';
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = newContribution.length > 100 ? '#ef4444' : '#e5e7eb';
                    }}
                  />
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginTop: '12px'
                  }}>
                    <span style={{ 
                      fontSize: '13px', 
                      color: newContribution.length > 100 ? '#ef4444' : newContribution.length === 100 ? '#f59e0b' : '#6b7280',
                      fontStyle: 'italic',
                      fontWeight: newContribution.length === 100 ? '700' : 'normal'
                    }}>
                      {newContribution.length}/100 characters
                    </span>
                    <button
                      onClick={handleAddContribution}
                      disabled={!newContribution.trim() || newContribution.trim().length > 100 || !selectedFictionItem.isPurchased}
                      style={{
                        padding: '12px 32px',
                        background: (newContribution.trim() && newContribution.trim().length <= 100 && selectedFictionItem.isPurchased)
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : '#d1d5db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '16px',
                        fontWeight: '700',
                        cursor: (newContribution.trim() && newContribution.trim().length <= 100 && selectedFictionItem.isPurchased) ? 'pointer' : 'not-allowed',
                        fontFamily: 'Dongle, sans-serif',
                        transition: 'all 0.3s',
                        boxShadow: (newContribution.trim() && newContribution.trim().length <= 100 && selectedFictionItem.isPurchased)
                          ? '0 4px 12px rgba(102, 126, 234, 0.3)'
                          : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (newContribution.trim() && newContribution.trim().length <= 100 && selectedFictionItem.isPurchased) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (newContribution.trim() && newContribution.trim().length <= 100 && selectedFictionItem.isPurchased) {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
                        }
                      }}
                    >
                      Add Contribution
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Shop;
