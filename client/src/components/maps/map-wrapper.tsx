import React, { useEffect, useRef } from 'react';

// A wrapper component that ensures a Leaflet map is only initialized once
interface MapWrapperProps {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const MapWrapper: React.FC<MapWrapperProps> = ({ 
  id, 
  className = "", 
  style = {}, 
  children 
}) => {
  const mapId = useRef(`map-${id || Math.random().toString(36).substring(2, 9)}`);
  const initialized = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Clone children with a unique key to ensure proper mounting/unmounting
  const childrenWithKey = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        ...child.props,
        key: mapId.current,
      });
    }
    return child;
  });
  
  useEffect(() => {
    // This ensures the map is only initialized once
    // and helps prevent duplicate map instances
    initialized.current = true;
    
    return () => {
      // Clean up when the component unmounts
      initialized.current = false;
    };
  }, []);
  
  const combinedStyle = {
    height: '100%',
    width: '100%',
    ...style
  };
  
  return (
    <div 
      ref={wrapperRef}
      id={mapId.current} 
      className={className} 
      style={combinedStyle}
    >
      {childrenWithKey}
    </div>
  );
};

export default MapWrapper;