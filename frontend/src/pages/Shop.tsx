import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import './MainMenu.css';

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
  isPurchased?: boolean;
  createdAt: string;
  updatedAt: string;
}

function Shop() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [assetPoints, setAssetPoints] = useState(0);

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
        setAssetPoints(response.data.user.assetPoints || 0);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const handlePurchase = async (item: ShopItem) => {
    if (item.isPurchased) {
      alert('You have already purchased this item!');
      return;
    }

    if (assetPoints < item.price) {
      alert(`Insufficient Asset Points. You need ${item.price.toLocaleString()} AP but only have ${assetPoints.toLocaleString()} AP.`);
      return;
    }

    if (!confirm(`Purchase "${item.title}" for ${item.price.toLocaleString()} AP?`)) {
      return;
    }

    try {
      const response = await axios.post(`/api/shop/items/${item._id}/purchase`);
      if (response.data.success) {
        // Show success message
        alert(`🎉 Successfully purchased "${item.title}"!\n\n${response.data.message || ''}`);
        // Update asset points immediately
        setAssetPoints(response.data.remainingAP || assetPoints - item.price);
        // Reload shop items to update purchase status
        await loadShopItems();
        // Reload user stats to ensure sync
        await loadUserStats();
      }
    } catch (error: any) {
      console.error('Error purchasing item:', error);
      alert(error.response?.data?.error || 'Failed to purchase item');
    }
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
            <h1 style={{ 
              fontSize: '3.5rem', 
              fontWeight: '700', 
              margin: 0,
              fontFamily: 'Dongle, sans-serif',
              textShadow: '0 2px 10px rgba(0,0,0,0.2)'
            }}>
              🛒 Shop
            </h1>
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
              <span>{assetPoints.toLocaleString()} AP</span>
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
                    border: `3px solid ${item.isPurchased ? '#22c55e' : assetPoints >= item.price ? '#e5e7eb' : '#f3f4f6'}`,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: (assetPoints >= item.price && !item.isPurchased) ? 'pointer' : 'default',
                    boxShadow: item.isPurchased 
                      ? '0 4px 20px rgba(34, 197, 94, 0.3)' 
                      : assetPoints >= item.price
                      ? '0 4px 15px rgba(0,0,0,0.08)'
                      : '0 2px 8px rgba(0,0,0,0.05)',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (assetPoints >= item.price && !item.isPurchased) {
                      e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.25)';
                      e.currentTarget.style.borderColor = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = item.isPurchased 
                      ? '0 4px 20px rgba(34, 197, 94, 0.3)' 
                      : assetPoints >= item.price
                      ? '0 4px 15px rgba(0,0,0,0.08)'
                      : '0 2px 8px rgba(0,0,0,0.05)';
                    e.currentTarget.style.borderColor = item.isPurchased ? '#22c55e' : assetPoints >= item.price ? '#e5e7eb' : '#f3f4f6';
                  }}
                  onClick={() => (assetPoints >= item.price && !item.isPurchased) && handlePurchase(item)}
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
                          {item.price.toLocaleString()} AP
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePurchase(item);
                        }}
                        disabled={assetPoints < item.price || item.isPurchased}
                        style={{
                          width: '100%',
                          padding: '14px',
                          background: item.isPurchased
                            ? '#22c55e'
                            : assetPoints >= item.price
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            : '#d1d5db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '1.5rem',
                          fontWeight: '700',
                          cursor: (assetPoints >= item.price && !item.isPurchased) ? 'pointer' : 'not-allowed',
                          fontFamily: 'Dongle, sans-serif',
                          transition: 'all 0.3s',
                          boxShadow: (assetPoints >= item.price && !item.isPurchased)
                            ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                            : 'none',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                          if (assetPoints >= item.price && !item.isPurchased) {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = (assetPoints >= item.price && !item.isPurchased)
                            ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                            : 'none';
                        }}
                      >
                        {item.isPurchased 
                          ? '✓ Purchased' 
                          : assetPoints >= item.price 
                          ? '🛒 Purchase Now' 
                          : `Need ${item.price - assetPoints} more AP`}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Shop;
