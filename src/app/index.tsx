import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  StatusBar,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { BottomTabInset } from '@/constants/theme';

type Step = 1 | 2 | 3 | 3.5 | 4;

interface HospitalCall {
  id: string;
  name: string;
  phone: string;
  lat: number;
  lng: number;
  distance: number;
  etaMin: number;
  status: '발신 중' | '수락' | '거절';
}

const JINJU_HOSPITALS = [
  {
    id: 'h1',
    name: '경상국립대학교병원',
    phone: '055-750-8000',
    lat: 35.1763,
    lng: 128.0958,
  },
  {
    id: 'h2',
    name: '진주고려병원',
    phone: '055-751-2500',
    lat: 35.1782,
    lng: 128.0921,
  },
  {
    id: 'h3',
    name: '제일병원 응급실',
    phone: '055-750-7000',
    lat: 35.1846,
    lng: 128.0825,
  },
  {
    id: 'h4',
    name: '한일병원 응급실',
    phone: '055-750-1119',
    lat: 35.1815,
    lng: 128.1189,
  },
  {
    id: 'h5',
    name: '진주복음병원 응급실',
    phone: '055-740-5000',
    lat: 35.1972,
    lng: 128.0681,
  },
];

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0.5, Math.round(R * c * 1.3 * 10) / 10);
}

export default function HomeScreen() {
  const [step, setStep] = useState<Step>(1);

  const [locationText, setLocationText] = useState('진주시 GPS 위치 탐색 중...');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 35.1799,
    lng: 128.1076,
  });

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conditionTitle, setConditionTitle] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  const [callSeconds, setCallSeconds] = useState(0);
  const [hospitals, setHospitals] = useState<HospitalCall[]>([]);

  const [selectedHospital, setSelectedHospital] = useState<HospitalCall | null>(null);

  const [arrivalSec, setArrivalSec] = useState(240);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationText('진주시 기본 좌표 적용 (GPS 권한 필요)');
          return;
        }

        const currentLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = currentLoc.coords;
        setCoords({ lat: latitude, lng: longitude });

        const addressList = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addressList.length > 0) {
          const addr = addressList[0];
          const areaName = `${addr.city || addr.region || '진주시'} ${addr.district || addr.street || ''}`.trim();
          setLocationText(`🟢 GPS 수신 (${areaName})`);
        } else {
          setLocationText(`🟢 GPS 수신 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        }
      } catch (e) {
        setLocationText('🟡 진주시 기본 좌표 적용 (실내 수신 약함)');
      }
    })();
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  useEffect(() => {
    if (step !== 2) return;

    setCallSeconds(0);

    const calculatedList: HospitalCall[] = JINJU_HOSPITALS.map((h) => {
      const dist = getDistanceKm(coords.lat, coords.lng, h.lat, h.lng);
      const eta = Math.max(2, Math.round((dist / 45) * 60));
      return {
        ...h,
        distance: dist,
        etaMin: eta,
        status: '발신 중',
      };
    });

    setHospitals(calculatedList);

    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);

    const t1 = setTimeout(() => {
      setHospitals((prev) => prev.map((h) => (h.id === 'h4' ? { ...h, status: '거절' } : h)));
    }, 1500);

    const t2 = setTimeout(() => {
      setHospitals((prev) => prev.map((h) => (h.id === 'h1' ? { ...h, status: '수락' } : h)));
    }, 2500);

    const t3 = setTimeout(() => {
      setHospitals((prev) => prev.map((h) => (h.id === 'h2' ? { ...h, status: '수락' } : h)));
    }, 3500);

    return () => {
      clearInterval(timer);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [step, coords]);

  useEffect(() => {
    if (step !== 3.5) return;
    const t = setTimeout(() => {
      if (selectedHospital) {
        setArrivalSec(selectedHospital.etaMin * 60);
      }
      setStep(4);
    }, 2000);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 4) return;
    setCallDurationSec(0);
    const interval = setInterval(() => {
      setArrivalSec((prev) => (prev > 0 ? prev - 1 : 0));
      setCallDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const formatTime = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const renderStepHeader = (title: string, currentNum: number) => (
    <View style={styles.topNav}>
      <View style={styles.topNavRow}>
        <Text style={styles.topNavTitle}>{title}</Text>
        <Text style={styles.topNavStep}>{currentNum} / 4</Text>
      </View>
      <View style={styles.progressBarRow}>
        {[1, 2, 3, 4].map((num) => (
          <View
            key={num}
            style={[
              styles.progressSegment,
              num < currentNum && styles.progressDone,
              num === currentNum && styles.progressCurrent,
            ]}
          />
        ))}
      </View>
    </View>
  );

  const handleMicPress = async () => {
    try {
      if (!isRecording) {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          Alert.alert('권한 필요', '설정에서 마이크 권한을 허용해 주세요.');
          return;
        }

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();

        setAudioUri(null);
        setTranscript('');
        setConditionTitle('');
        setKeywords([]);
        setIsRecording(true);
      } else {
        setIsRecording(false);
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        setAudioUri(uri);
        console.log('생성된 실제 녹음 파일(.m4a):', uri);

        setTranscript('60대 남성, 흉통 호소하다가 심정지 발생. 현재 CPR 진행 중입니다.');
        setConditionTitle('심정지');
        setKeywords(['즉시', 'CPR 진행 중', '60대 남성']);
      }
    } catch (err) {
      console.error('마이크 녹음 오류:', err);
      setIsRecording(false);
    }
  };

  const resetAllToHome = () => {
    setIsRecording(false);
    setAudioUri(null);
    setTranscript('');
    setConditionTitle('');
    setKeywords([]);
    setSelectedHospital(null);
    setStep(1);
  };

  if (step === 1) {
    const hasResult = transcript.length > 0;
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {renderStepHeader('환자 상태', 1)}

        <View style={styles.teamBar}>
          <View style={styles.badge119}>
            <Text style={styles.badge119Text}>119</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamName}>진주소방서 구급대 · 민선규 대원</Text>
            <Text style={styles.gpsStatusText}>{locationText}</Text>
          </View>
          <View style={styles.nightBadge}>
            <Text style={styles.nightBadgeText}>🌙 야간</Text>
          </View>
        </View>

        <View style={styles.centerSection}>
          <Text style={styles.guideTitle}>
            {isRecording
              ? '환자 상태를 말씀해 주세요'
              : hasResult
              ? `AI 분류: [${conditionTitle}]`
              : '음성으로 환자 상태를 입력하세요'}
          </Text>
          <Text style={styles.guideSub}>
            {isRecording
              ? '말씀이 끝나면 [녹음 완료] 버튼을 눌러주세요'
              : hasResult
              ? '현재 진주시 GPS 기준 주변 병원 5곳에 동시 호출합니다'
              : '증상, 의식 상태, 처치를 말하면 AI가 자동 요약합니다'}
          </Text>

          <View style={styles.micContainer}>
            {isRecording && (
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.micButton,
                isRecording
                  ? styles.micButtonRecording
                  : hasResult
                  ? styles.micButtonDone
                  : styles.micButtonIdle,
              ]}
              onPress={handleMicPress}
            >
              <Text style={styles.micIcon}>{isRecording ? '⏹️' : hasResult ? '🔄' : '🎙️'}</Text>
              <Text style={styles.micLabel}>
                {isRecording ? '녹음 완료' : hasResult ? '다시 말하기' : '음성 녹음 시작'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.resultBox}>
            {isRecording ? (
              <Text style={styles.listeningText}>🔴 실시간 음성 녹음 중... (.m4a 생성 중)</Text>
            ) : hasResult ? (
              <>
                <Text style={styles.transcriptText}>"{transcript}"</Text>
                <View style={styles.tagRow}>
                  <View style={styles.urgentTag}>
                    <Text style={styles.urgentTagText}>⚠ {conditionTitle}</Text>
                  </View>
                  {keywords.map((kw, idx) => (
                    <View key={idx} style={styles.keywordTag}>
                      <Text style={styles.keywordTagText}>#{kw}</Text>
                    </View>
                  ))}
                </View>
                {audioUri && (
                  <Text style={styles.audioFileText}>
                    📎 녹음 파일 저장됨: {audioUri.split('/').pop()}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.placeholderText}>
                버튼을 누르고 환자 증상을 말씀해 주세요
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, hasResult && !isRecording && styles.primaryBtnActive]}
          disabled={!hasResult || isRecording}
          onPress={() => setStep(2)}
        >
          <Text style={styles.primaryBtnText}>
            {hasResult && !isRecording
              ? `>>> [${conditionTitle}] 진주시 병원 5곳 동시 호출`
              : '먼저 환자 상태를 녹음하세요'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 2) {
    const acceptedList = hospitals.filter((h) => h.status === '수락');
    const waitingCount = hospitals.filter((h) => h.status === '발신 중').length;
    const rejectedCount = hospitals.filter((h) => h.status === '거절').length;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {renderStepHeader('병원 호출', 2)}

        <Text style={styles.subCaption}>{conditionTitle} · 진주시 응급의료기관 5곳 동시 호출</Text>

        <View style={styles.timerRow}>
          <Text style={styles.bigTimer}>{formatTime(callSeconds)}</Text>
          <Text style={styles.timerSuffix}>경과</Text>
        </View>

        <View style={styles.countGrid}>
          <View style={[styles.countBox, { borderColor: '#22C55E' }]}>
            <Text style={[styles.countLabel, { color: '#22C55E' }]}>✔ 수락</Text>
            <Text style={styles.countNumber}>{acceptedList.length}</Text>
          </View>
          <View style={[styles.countBox, { borderColor: '#EAB308' }]}>
            <Text style={[styles.countLabel, { color: '#EAB308' }]}>💬 대기</Text>
            <Text style={styles.countNumber}>{waitingCount}</Text>
          </View>
          <View style={[styles.countBox, { borderColor: '#374151' }]}>
            <Text style={[styles.countLabel, { color: '#9CA3AF' }]}>✖ 거절</Text>
            <Text style={styles.countNumber}>{rejectedCount}</Text>
          </View>
        </View>

        <ScrollView style={{ flex: 1, marginVertical: 12 }}>
          {hospitals.map((h) => {
            const isAccepted = h.status === '수락';
            const isRejected = h.status === '거절';
            return (
              <View
                key={h.id}
                style={[
                  styles.callRowCard,
                  isAccepted && { borderColor: '#22C55E' },
                  isRejected && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.callStatusIcon}>
                  {isAccepted ? '🟢' : isRejected ? '✖' : '🟡'}
                </Text>
                <Text style={styles.callHospitalName} numberOfLines={1}>
                  {h.name}
                </Text>
                <Text style={styles.callDistance}>{h.distance}km</Text>
                <Text
                  style={[
                    styles.callStatusText,
                    isAccepted
                      ? { color: '#22C55E' }
                      : isRejected
                      ? { color: '#9CA3AF' }
                      : { color: '#EAB308' },
                  ]}
                >
                  {h.status}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.primaryBtn, acceptedList.length > 0 && styles.primaryBtnGreen]}
          disabled={acceptedList.length === 0}
          onPress={() => setStep(3)}
        >
          <Text style={[styles.primaryBtnText, acceptedList.length > 0 && { color: '#052E16' }]}>
            {acceptedList.length > 0
              ? `수락 병원 ${acceptedList.length}곳 확인 및 선택 >>>`
              : '수락 병원을 기다리는 중...'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelOutlineBtn}
          delayLongPress={800}
          onLongPress={() => {
            Alert.alert('호출 취소', '전체 병원 호출이 취소되었습니다.');
            setStep(1);
          }}
        >
          <Text style={styles.cancelOutlineText}>전체 호출 취소 (길게 누르기)</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 3) {
    const acceptedSorted = hospitals
      .filter((h) => h.status === '수락')
      .sort((a, b) => a.distance - b.distance);

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {renderStepHeader('병원 선택', 3)}

        <View style={styles.yellowBanner}>
          <Text style={styles.yellowBannerText}>● 병원 {acceptedSorted.length}곳이 대기 중</Text>
          <Text style={styles.yellowBannerTimer}>{formatTime(callSeconds)}</Text>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {acceptedSorted.map((h, index) => {
            const isFirst = index === 0;
            return (
              <TouchableOpacity
                key={h.id}
                activeOpacity={0.85}
                delayLongPress={600}
                onLongPress={() => {
                  setSelectedHospital(h);
                  setStep(3.5);
                }}
                style={[styles.selectCard, isFirst && styles.selectCardFirst]}
              >
                <View style={styles.rankRow}>
                  <View style={[styles.rankBadge, isFirst && styles.rankBadgeFirst]}>
                    <Text style={[styles.rankBadgeText, isFirst && { color: '#052E16' }]}>
                      {isFirst ? '1순위 · 가장 빠름' : `${index + 1}순위`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.selectHospitalName}>{h.name}</Text>

                <View style={styles.etaRow}>
                  <Text style={styles.bigEta}>{h.etaMin}</Text>
                  <Text style={styles.etaUnit}>분</Text>
                  <Text style={styles.selectDistance}>{h.distance}km</Text>
                </View>

                <View style={styles.longPressHintRow}>
                  <Text style={styles.longPressHintText}>✋ 길게 눌러 직통 연결 ({h.phone})</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.bottomNotice}>
          {conditionTitle} · 선택하면 나머지 병원 호출은 자동 취소
        </Text>
      </SafeAreaView>
    );
  }

  if (step === 3.5 && selectedHospital) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {renderStepHeader('병원 선택', 3)}

        <View style={styles.connectingCenter}>
          <View style={styles.greenPhoneCircle}>
            <Text style={{ fontSize: 44 }}>📞</Text>
          </View>
          <Text style={styles.connectingHospital}>{selectedHospital.name}</Text>
          <Text style={styles.connectingSub}>직통 연결 중 ({selectedHospital.phone})</Text>
          <Text style={styles.connectingCancelNote}>✖ 나머지 병원 호출 취소됨</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {renderStepHeader('이송', 4)}

      <View style={styles.confirmedBanner}>
        <Text style={{ fontSize: 24, marginRight: 10 }}>🏥</Text>
        <View>
          <Text style={styles.confirmedHospital}>
            {selectedHospital?.name || '경상국립대학교병원'}
          </Text>
          <Text style={styles.confirmedSub}>{conditionTitle} · 수용 확정</Text>
        </View>
      </View>

      <View style={styles.etaSection}>
        <Text style={styles.etaLabel}>도착까지</Text>
        <Text style={styles.countdownText}>
          {Math.floor(arrivalSec / 60)}:{String(arrivalSec % 60).padStart(2, '0')}
        </Text>
        <Text style={styles.remainKm}>
          {selectedHospital?.distance || '2.4'} km 남음
        </Text>

        <View style={styles.routeTrack}>
          <View style={styles.ambulanceDot}>
            <Text style={{ fontSize: 16 }}>🚑</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.hospitalDot}>
            <Text style={{ fontSize: 16 }}>🏥</Text>
          </View>
        </View>
        <View style={styles.routeLabels}>
          <Text style={styles.routeLabelText}>현장 (진주시)</Text>
          <Text style={styles.routeLabelText}>{selectedHospital?.name || '병원'}</Text>
        </View>
      </View>

      <View style={styles.callControlPanel}>
        <View style={styles.callHeaderRow}>
          <Text style={styles.inCallStatus}>● 병원 직통 통화 중</Text>
          <Text style={styles.inCallTimer}>{formatTime(callDurationSec)}</Text>
        </View>

        <View style={styles.audioBtnRow}>
          <TouchableOpacity
            style={[styles.audioToggleBtn, !isMicOn && styles.audioToggleOff]}
            onPress={() => setIsMicOn(!isMicOn)}
          >
            <Text style={styles.audioToggleText}>
              {isMicOn ? '🎙️ 마이크 켜짐' : '🔇 마이크 꺼짐'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.audioToggleBtn, !isSpeakerOn && styles.audioToggleOff]}
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          >
            <Text style={styles.audioToggleText}>
              {isSpeakerOn ? '🔊 스피커 켜짐' : '🔈 스피커 꺼짐'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.endCallBtn}
          onPress={() => Alert.alert('통화 종료', '병원과의 직통 통화가 종료되었습니다.')}
        >
          <View style={styles.endCallIconBox}>
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>》</Text>
          </View>
          <Text style={styles.endCallText}>밀어서 통화 종료</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.finishMissionBtn} onPress={resetAllToHome}>
          <Text style={styles.finishMissionText}>이송 완료 · 출동 종료</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C0E',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: BottomTabInset + 12,
  },
  topNav: { marginBottom: 14 },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topNavTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  topNavStep: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  progressBarRow: { flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#262930' },
  progressDone: { backgroundColor: '#22C55E' },
  progressCurrent: { backgroundColor: '#FFFFFF' },

  teamBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141619',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22252A',
  },
  badge119: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  badge119Text: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  teamName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  gpsStatusText: { color: '#34D399', fontSize: 12, marginTop: 2, fontWeight: '600' },
  nightBadge: {
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  nightBadgeText: { color: '#D1D5DB', fontSize: 12 },
  centerSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guideTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  guideSub: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 28 },
  micContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: 'rgba(225, 29, 72, 0.25)',
    borderWidth: 2,
    borderColor: '#E11D48',
  },
  micButton: {
    width: 118,
    height: 118,
    borderRadius: 59,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonIdle: { backgroundColor: '#2563EB' },
  micButtonRecording: { backgroundColor: '#E11D48' },
  micButtonDone: { backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#4B5563' },
  micIcon: { fontSize: 32, marginBottom: 4 },
  micLabel: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  resultBox: {
    width: '100%',
    minHeight: 115,
    backgroundColor: '#141619',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262930',
    justifyContent: 'center',
  },
  listeningText: { color: '#F87171', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  placeholderText: { color: '#6B7280', fontSize: 14, textAlign: 'center' },
  transcriptText: { color: '#F3F4F6', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  urgentTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  urgentTagText: { color: '#F87171', fontWeight: 'bold', fontSize: 12 },
  keywordTag: { backgroundColor: '#22252A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  keywordTagText: { color: '#93C5FD', fontSize: 12, fontWeight: '600' },
  audioFileText: {
    color: '#6EE7B7',
    fontSize: 11,
    marginTop: 10,
  },

  primaryBtn: {
    backgroundColor: '#1F2229',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnActive: { backgroundColor: '#E11D48' },
  primaryBtnGreen: { backgroundColor: '#22C55E' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },

  subCaption: { color: '#D1D5DB', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 },
  bigTimer: { color: '#FFFFFF', fontSize: 52, fontWeight: '300', letterSpacing: 2 },
  timerSuffix: { color: '#9CA3AF', fontSize: 15, marginLeft: 8 },
  countGrid: { flexDirection: 'row', gap: 10 },
  countBox: {
    flex: 1,
    backgroundColor: '#141619',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  countLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  countNumber: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold' },
  callRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141619',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22252A',
    marginBottom: 8,
  },
  callStatusIcon: { fontSize: 14, marginRight: 10 },
  callHospitalName: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', flex: 1 },
  callDistance: { color: '#9CA3AF', fontSize: 13, marginRight: 12 },
  callStatusText: { fontSize: 13, fontWeight: 'bold' },
  cancelOutlineBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelOutlineText: { color: '#D1D5DB', fontSize: 14, fontWeight: '600' },

  yellowBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FACC15',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  yellowBannerText: { color: '#0B0C0E', fontWeight: 'bold', fontSize: 14 },
  yellowBannerTimer: { color: '#0B0C0E', fontWeight: 'bold', fontSize: 15 },
  selectCard: {
    backgroundColor: '#141619',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#2A2E35',
    marginBottom: 14,
  },
  selectCardFirst: {
    borderColor: '#22C55E',
    backgroundColor: '#111915',
  },
  rankRow: { flexDirection: 'row', marginBottom: 10 },
  rankBadge: {
    backgroundColor: '#262930',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rankBadgeFirst: { backgroundColor: '#22C55E' },
  rankBadgeText: { color: '#D1D5DB', fontSize: 12, fontWeight: 'bold' },
  selectHospitalName: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', marginBottom: 14 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  bigEta: { color: '#FFFFFF', fontSize: 44, fontWeight: 'bold' },
  etaUnit: { color: '#FFFFFF', fontSize: 18, marginLeft: 4, marginRight: 14 },
  selectDistance: { color: '#9CA3AF', fontSize: 16 },
  longPressHintRow: {
    borderTopWidth: 1,
    borderTopColor: '#252930',
    paddingTop: 10,
  },
  longPressHintText: { color: '#D1D5DB', fontSize: 13, fontWeight: '600' },
  bottomNotice: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginTop: 6 },

  connectingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greenPhoneCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  connectingHospital: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  connectingSub: { color: '#22C55E', fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  connectingCancelNote: { color: '#9CA3AF', fontSize: 13 },

  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22C55E',
    padding: 14,
    borderRadius: 10,
    marginBottom: 18,
  },
  confirmedHospital: { color: '#052E16', fontSize: 17, fontWeight: '900' },
  confirmedSub: { color: '#052E16', fontSize: 13, fontWeight: '700' },
  etaSection: { flex: 1 },
  etaLabel: { color: '#9CA3AF', fontSize: 14, marginBottom: 4 },
  countdownText: { color: '#FFFFFF', fontSize: 64, fontWeight: '300', lineHeight: 72 },
  remainKm: { color: '#D1D5DB', fontSize: 18, fontWeight: '600', marginBottom: 24 },
  routeTrack: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  ambulanceDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeLine: { flex: 1, height: 4, backgroundColor: '#262930', marginHorizontal: 6 },
  hospitalDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  routeLabelText: { color: '#9CA3AF', fontSize: 12 },

  callControlPanel: {
    borderTopWidth: 1,
    borderTopColor: '#22252A',
    paddingTop: 14,
  },
  callHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inCallStatus: { color: '#22C55E', fontSize: 13, fontWeight: 'bold' },
  inCallTimer: { color: '#9CA3AF', fontSize: 13 },
  audioBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  audioToggleBtn: {
    flex: 1,
    backgroundColor: '#141619',
    borderWidth: 1,
    borderColor: '#2A2E35',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  audioToggleOff: { opacity: 0.5 },
  audioToggleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  endCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141619',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    padding: 6,
    marginBottom: 10,
  },
  endCallIconBox: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  endCallText: {
    flex: 1,
    textAlign: 'center',
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 30,
  },
  finishMissionBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  finishMissionText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});