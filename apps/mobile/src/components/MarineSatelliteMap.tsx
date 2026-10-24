import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Crosshair, Layers, LocateFixed, Waves } from 'lucide-react-native';
import { color, radius, shadow } from '../theme/index.ts';
import marineSatelliteMap from '../../assets/marine-satellite-map.jpg';

interface StationProps {
  label: string;
  top: `${number}%`;
  left: `${number}%`;
  onPress?: () => void;
}

function MarineStationBadge({ label, top, left, onPress }: StationProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Marine station: ${label}`}
      style={{
        position: 'absolute',
        top,
        left,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#00897E',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 30,
        borderWidth: 1.2,
        borderColor: '#A4E4D0',
        shadowColor: '#002B36',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
        elevation: 4,
      }}
    >
      <Waves size={13} color="#FFFFFF" strokeWidth={2.4} />
      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function QuestMapBadge({ code, points, top, left, onPress }: { code: string; points: number; top: `${number}%`; left: `${number}%`; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Quest ${code}, +${points}`}
      style={{
        position: 'absolute',
        top,
        left,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(18, 25, 33, 0.88)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E87A5D',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#E87A5D', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900', lineHeight: 11 }}>✕</Text>
      </View>
      <Text style={{ color: '#F7C948', fontSize: 10, fontWeight: '700' }}>
        {`${code} → +${points}`}
      </Text>
    </Pressable>
  );
}

export function MarineSatelliteMapCard({
  onSelectStation,
  onOpenQuest,
  onToggleLayers,
  onLocate,
  onResetOrientation,
}: {
  onSelectStation?: (name: string) => void;
  onOpenQuest?: (id: string) => void;
  onToggleLayers?: () => void;
  onLocate?: () => void;
  onResetOrientation?: () => void;
}) {
  return (
    <View
      style={[
        shadow.card,
        {
          borderRadius: 26,
          backgroundColor: '#0D3447',
          borderWidth: 1.5,
          borderColor: '#BED4EB',
          overflow: 'hidden',
          height: 420,
          position: 'relative',
        },
      ]}
    >
      {/* High-res satellite image layer */}
      <Image
        source={marineSatelliteMap}
        resizeMode="cover"
        style={{ width: '100%', height: '100%' }}
        accessibilityLabel="Satellite marine map of Koh Samui"
      />

      {/* Floating Control: Crosshair (Top-left) */}
      <Pressable
        onPress={onResetOrientation}
        accessibilityRole="button"
        accessibilityLabel="Reset map orientation"
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: 'rgba(251, 252, 255, 0.95)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#E2ECF5',
          shadowColor: '#092B3A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <Crosshair size={18} color="#2A4865" strokeWidth={2.2} />
      </Pressable>

      {/* Floating Controls: Layers & Locate (Top-right & mid-right) */}
      <Pressable
        onPress={onToggleLayers}
        accessibilityRole="button"
        accessibilityLabel="Toggle map layers"
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: 'rgba(251, 252, 255, 0.95)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#E2ECF5',
          shadowColor: '#092B3A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <Layers size={18} color="#2A4865" strokeWidth={2.2} />
      </Pressable>

      <Pressable
        onPress={onLocate}
        accessibilityRole="button"
        accessibilityLabel="Locate current position"
        style={{
          position: 'absolute',
          top: 60,
          right: 14,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: 'rgba(251, 252, 255, 0.95)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#E2ECF5',
          shadowColor: '#092B3A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <LocateFixed size={18} color="#2A4865" strokeWidth={2.2} />
      </Pressable>

      {/* Island / Ocean Labels */}
      <Text
        style={{
          position: 'absolute',
          top: '11%',
          left: '58%',
          color: '#FFFFFF',
          fontSize: 12,
          fontWeight: '700',
          textShadowColor: 'rgba(0,0,0,0.8)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}
      >
        เกาะพะงัน
      </Text>

      <Text
        style={{
          position: 'absolute',
          top: '56%',
          left: '37%',
          color: '#FFFFFF',
          fontSize: 17,
          fontWeight: '800',
          letterSpacing: 0.5,
          textShadowColor: 'rgba(0,0,0,0.9)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 4,
        }}
      >
        เกาะสมุย
      </Text>

      <View style={{ position: 'absolute', bottom: '26%', left: '14%', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00B4D8', borderWidth: 1.5, borderColor: '#FFFFFF' }} />
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '600',
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }}
        >
          เกาะแตน
        </Text>
      </View>

      {/* Marine Station Badges (Exact positions from Figma) */}
      <MarineStationBadge
        label="81  FISHERMAN'S"
        top="18%"
        left="56%"
        onPress={() => onSelectStation?.("Fisherman's Village")}
      />

      <MarineStationBadge
        label="88  NA MUANG"
        top="53%"
        left="21%"
        onPress={() => onSelectStation?.("Na Muang")}
      />

      <MarineStationBadge
        label="LAMAI"
        top="54%"
        left="51%"
        onPress={() => onSelectStation?.("Lamai Beach")}
      />

      {/* Quest Badges */}
      <QuestMapBadge
        code="WK-01"
        points={50}
        top="60%"
        left="52%"
        onPress={() => onOpenQuest?.('samui-mangrove-walk')}
      />

      <QuestMapBadge
        code="BC-04"
        points={50}
        top="57%"
        left="68%"
        onPress={() => onOpenQuest?.('chaweng-morning-clean')}
      />

      {/* Bottom Marine Forecast Card Overlay */}
      <View
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          backgroundColor: '#D5EAF6',
          borderRadius: 22,
          borderWidth: 1.2,
          borderColor: '#F5FCFF',
          paddingVertical: 10,
          paddingHorizontal: 14,
          shadowColor: '#022131',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.22,
          shadowRadius: 6,
          elevation: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Waves size={16} color="#0077B6" strokeWidth={2.4} />
            <Text style={{ color: '#102E48', fontSize: 13, fontWeight: '700', letterSpacing: -0.2 }}>
              ทะเลสมุยตอนบน - เฉลี่ยพื้นที่ 81
            </Text>
          </View>
          <ChevronRight size={16} color="#102E48" strokeWidth={2.2} />
        </View>

        <View style={{ height: 1, backgroundColor: '#A9C7D8', marginVertical: 6, opacity: 0.7 }} />

        <Text style={{ color: '#52749D', fontSize: 12, fontWeight: '500', paddingLeft: 24 }}>
          คลื่นสูง 1.2 - 2.0 ม.  |  ลม 10-20 นอต
        </Text>
      </View>
    </View>
  );
}
