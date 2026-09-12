import { createContext, useContext, useState, useEffect } from 'react';
import { averageRating } from '../utils/rating';
import { borschAPI } from '../api';
import borschData from '../data/borsch.json';

const BorschContext = createContext();

export const BorschProvider = ({ children }) => {
  const [borsch, setBorsch] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBorschData();

    const handleBorschDataUpdated = () => {
      loadBorschData();
    };

    window.addEventListener('borschDataUpdated', handleBorschDataUpdated);

    return () => {
      window.removeEventListener('borschDataUpdated', handleBorschDataUpdated);
    };
  }, []);

  const loadBorschData = async () => {
    try {
      const apiBorsch = await borschAPI.getAll();
      setBorsch(apiBorsch);      
    } catch (error) {
      console.error('API error, falling back to local data:', error);
      // Fallback: try localStorage, then JSON
      const stored = localStorage.getItem('borsch');
      if (stored) {
        setBorsch(JSON.parse(stored));
      } else {
        setBorsch(borschData);
        localStorage.setItem('borsch', JSON.stringify(borschData));
      }
    } finally {
      setLoading(false);
    }
  };

  const getBorschById = (id) => {
    return borsch.find(b => String(b.id_borsch) === String(id));
  };

  const getAllBorsch = () => {
    return borsch;
  };

  const getBorschByPlaceId = (placeId) => {
    return borsch.filter(b => String(b.place_id) === String(placeId));
  };

  const addBorsch = (newBorsch) => {
    const borschWithId = {
      ...newBorsch,
      id_borsch: Date.now().toString(),
      created_at: new Date().toISOString(),
    };

    const updatedBorsch = [...borsch, borschWithId];
    setBorsch(updatedBorsch);
    localStorage.setItem('borsch', JSON.stringify(updatedBorsch));

    return borschWithId;
  };

  const updateBorsch = (id, updates) => {
    const updatedBorsch = borsch.map(b =>
      String(b.id_borsch) === String(id) ? { ...b, ...updates, updated_at: new Date().toISOString() } : b
    );

    setBorsch(updatedBorsch);
    localStorage.setItem('borsch', JSON.stringify(updatedBorsch));
  };

  const deleteBorsch = (id) => {
    const updatedBorsch = borsch.filter(b => String(b.id_borsch) !== String(id));
    setBorsch(updatedBorsch);
    localStorage.setItem('borsch', JSON.stringify(updatedBorsch));
  };

  const updateBorschRating = (id, ratingUpdates) => {
    const updatedBorsch = borsch.map(b =>
      String(b.id_borsch) === String(id) ? { ...b, ...ratingUpdates, updated_at: new Date().toISOString() } : b
    );

    setBorsch(updatedBorsch);
    localStorage.setItem('borsch', JSON.stringify(updatedBorsch));
  };

  const syncWithLocalStorage = () => {
    loadBorschData();
  };

  const getAveragePlaceRating = (placeId) => {
    const placeBorsch = borsch.filter(b => String(b.place_id) === String(placeId));
    // Average only the rated borsches (1..10). Including unrated ones as 0 —
    // which the old code did — dragged the place score down and could show 0.
    return averageRating(placeBorsch.map((b) => b.overall_rating));
  };

  // "Розвідка борщу" — three honest states, because the catalogue import is
  // itself a record of real tastings:
  //   'virgin'    — not a single review: nobody has ever rated this borsch
  //   'unverified'— rated in the founders' catalogue, never confirmed by the
  //                 community (97 of 100 borsches today)
  //   'confirmed' — at least one community review
  //   'unknown'   — no data (old API, local fallback, or no borsch loaded for
  //                 this place) → the UI must stay silent rather than guess
  const getBorschExploration = (b) => {
    if (!b || b.community_review_count === null || b.community_review_count === undefined) {
      return 'unknown';
    }
    if (b.community_review_count > 0) return 'confirmed';
    return b.rating_count > 0 ? 'unverified' : 'virgin';
  };

  // A place takes the state of its best-explored borsch: one confirmed borsch
  // makes the venue confirmed, and only a venue with nothing rated is virgin.
  const getPlaceExploration = (placeId) => {
    const states = borsch
      .filter(b => String(b.place_id) === String(placeId))
      .map(getBorschExploration);
    if (!states.length || states.includes('unknown')) return 'unknown';
    if (states.includes('confirmed')) return 'confirmed';
    if (states.includes('unverified')) return 'unverified';
    return 'virgin';
  };

  // Quest board: borsches the community has not confirmed yet, virgin first —
  // the map's "N нерозвіданих поруч" chip walks this list.
  const getQuestBorsches = () => {
    const rank = { virgin: 0, unverified: 1 };
    return borsch
      .map((b) => ({ borsch: b, state: getBorschExploration(b) }))
      .filter(({ state }) => state === 'virgin' || state === 'unverified')
      .sort((a, b) => rank[a.state] - rank[b.state]);
  };

  const value = {
    borsch,
    loading,
    getBorschById,
    getAllBorsch,
    getBorschByPlaceId,
    addBorsch,
    updateBorsch,
    deleteBorsch,
    updateBorschRating,
    loadBorschData,
    syncWithLocalStorage,
    getAveragePlaceRating,
    getBorschExploration,
    getPlaceExploration,
    getQuestBorsches
  };

  return (
    <BorschContext.Provider value={value}>
      {children}
    </BorschContext.Provider>
  );
};

export const useBorsch = () => {
  const context = useContext(BorschContext);
  if (!context) {
    throw new Error('useBorsch must be used within BorschProvider');
  }
  return context;
};
