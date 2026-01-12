import React, { useState, useEffect } from 'react';
import { HardDrive, Trash2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { getStorageStats, cleanupStorage, getStorageSize } from '../utils/storageHelpers';

/**
 * Storage Monitor Component
 * Provides a UI for monitoring localStorage usage and performing cleanup
 */
const StorageMonitor = ({ onClose }) => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [lastCleanup, setLastCleanup] = useState(null);

  const loadStats = () => {
    setIsLoading(true);
    try {
      const storageStats = getStorageStats();
      setStats(storageStats);
    } catch (error) {
      console.error('Error loading storage stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      const cleanupResult = await cleanupStorage();
      setLastCleanup(cleanupResult);
      // Reload stats after cleanup
      setTimeout(loadStats, 500);
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      setIsCleaningUp(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getStatusColor = (utilizationPercent) => {
    if (utilizationPercent < 50) return 'text-green-600';
    if (utilizationPercent < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = (utilizationPercent) => {
    if (utilizationPercent < 80) return <CheckCircle className="w-5 h-5 text-green-600" />;
    return <AlertTriangle className="w-5 h-5 text-red-600" />;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2">Loading storage stats...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <HardDrive className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-xl font-bold">Storage Monitor</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {stats && (
          <>
            {/* Storage Overview */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">Storage Usage</span>
                {getStatusIcon(stats.utilizationPercent)}
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    stats.utilizationPercent < 50 ? 'bg-green-500' :
                    stats.utilizationPercent < 80 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(stats.utilizationPercent, 100)}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className={getStatusColor(stats.utilizationPercent)}>
                  {formatSize(stats.totalSize)} used ({stats.utilizationPercent.toFixed(1)}%)
                </span>
                <span className="text-gray-600">
                  {stats.totalItems} items
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={loadStats}
                disabled={isLoading}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
              <button
                onClick={handleCleanup}
                disabled={isCleaningUp}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className={`w-4 h-4 mr-2 ${isCleaningUp ? 'animate-pulse' : ''}`} />
                {isCleaningUp ? 'Cleaning...' : 'Cleanup Storage'}
              </button>
            </div>

            {/* Last Cleanup Result */}
            {lastCleanup && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-green-800 mb-2">Cleanup Complete</h3>
                <div className="text-sm text-green-700">
                  <p>• {lastCleanup.itemsRemoved} items removed</p>
                  <p>• {formatSize(lastCleanup.spaceFreed)} space freed</p>
                  <p>• Storage: {formatSize(lastCleanup.sizeBefore)} → {formatSize(lastCleanup.sizeAfter)}</p>
                </div>
              </div>
            )}

            {/* Storage Items */}
            <div>
              <h3 className="font-semibold mb-3">Largest Storage Items</h3>
              <div className="space-y-2">
                {stats.items.map((item, index) => (
                  <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.key}
                        {item.essential && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Essential
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 ml-4">
                      {formatSize(item.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Storage Tips */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Storage Tips</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Analysis results are automatically compressed when storage is full</li>
                <li>• Old analysis states (>24h) are automatically cleaned up</li>
                <li>• Essential user data (profile, subscription) is never removed</li>
                <li>• Storage is monitored and cleaned up every 30 minutes</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StorageMonitor;



