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
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { BottomTabInset } from '@/constants/theme';

type Step = 1 | 2 | 3 | 3.5 | 4;
type CallStatus = '발신 중' | '의사 확인 중' | '수락' | '거절';
type EmergencyType = '심정지' | '중증외상' | '급성심근경색' | '뇌졸중';

interface PatientInfo {
  age: number | null;
  sex: 'M' | 'F' | null;
  consciousness: string;
  cpr: boolean;
  cpr_minutes: number | null;
  blood_pressure: string | null;
  medications: string[];
  surgery_history: string[];
  emergency_type: EmergencyType;
  onset_time: string | null;
  missing_fields: string[];
}

interface HospitalCall {
  id: string;
  name: string;
  phone: string;
  lat: number;
  lng: number;
  distance: number;
  etaMin: number;
  status: CallStatus;
  rejectReason?: string;
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
  const [recordingMode, setRecordingMode] = useState<'initial' | 'supplement'>('initial');
  const [transcript, setTranscript] = useState('');
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);

  const [callSeconds, setCallSeconds] = useState(0);
  const [hospitals, setHospitals] = useState<HospitalCall[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalCall | null>(null);
  const [isDirectCallMode, setIsDirectCallMode] = useState(false);

  const [arrivalSec, setArrivalSec] = useState(240);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [sliderWidth, setSliderWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const maxSlideRef = useRef(0);
  maxSlideRef.current = Math.max(0, sliderWidth - 54);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const clampedX = Math.max(0, Math.min(gestureState.dx, maxSlideRef.current));
        slideAnim.setValue(clampedX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (maxSlideRef.current > 0 && gestureState.dx >= maxSlideRef.current * 0.8) {
          Animated.timing(slideAnim, {
            toValue: maxSlideRef.current,
            duration: 120,
            useNativeDriver: false,
          }).start(() => {
            Alert.alert('통화 종료', '병원과의 직통 통화가 종료되었습니다.');
            slideAnim.setValue(0);
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const [pressingId, setPressingId] = useState<string | null>(null);
  const holdAnim = useRef(new Animated.Value(0)).current;

  const handleHoldStart = (hospital: HospitalCall) => {
    setPressingId(hospital.id);
    holdAnim.setValue(0);

    Animated.timing(holdAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setPressingId(null);
        holdAnim.setValue(0);
        setIsDirectCallMode(false);
        setSelectedHospital(hospital);
        setStep(3.5);
      }
    });
  };

  const handleHoldEnd = () => {
    holdAnim.stopAnimation();
    holdAnim.setValue(0);
    setPressingId(null);
  };

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
      setHospitals((prev) =>
        prev.map((h) =>
          h.id === 'h4' ? { ...h, status: '거절', rejectReason: '당직 전문의 부재' } : h
        )
      );
    }, 1500);

    const t2 = setTimeout(() => {
      setHospitals((prev) =>
        prev.map((h) => (h.id === 'h1' ? { ...h, status: '의사 확인 중' } : h))
      );
    }, 2200);

    const t3 = setTimeout(() => {
      setHospitals((prev) => prev.map((h) => (h.id === 'h2' ? { ...h, status: '수락' } : h)));
    }, 3200);

    const t4 = setTimeout(() => {
      setHospitals((prev) => prev.map((h) => (h.id === 'h1' ? { ...h, status: '수락' } : h)));
    }, 4500);

    return () => {
      clearInterval(timer);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
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
    slideAnim.setValue(0);
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

  const handleMicPress = async (mode: 'initial' | 'supplement' = 'initial') => {
    try {
      if (!isRecording) {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          Alert.alert('권한 필요', '설정에서 마이크 권한을 허용해 주세요.');
          return;
        }

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();

        setRecordingMode(mode);
        if (mode === 'initial') {
          setAudioUri(null);
          setTranscript('');
          setPatientInfo(null);
        }
        setIsRecording(true);
      } else {
        setIsRecording(false);
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        setAudioUri(uri);
        console.log('생성된 실제 녹음 파일(.m4a):', uri);

        if (recordingMode === 'initial') {
          setTranscript('60대 남성, 의식 무반응이고 CPR 5분째 진행 중입니다.');
          setPatientInfo({
            age: 65,
            sex: 'M',
            consciousness: '무반응',
            cpr: true,
            cpr_minutes: 5,
            blood_pressure: null,
            medications: [],
            surgery_history: [],
            emergency_type: '심정지',
            onset_time: null,
            missing_fields: ['복용약', '수술력', '발생 시각'],
          });
        } else {
          setTranscript(
            '60대 남성, 의식 무반응이고 CPR 5분째 진행 중입니다. (추가: 와파린 복용 중, 심장 스텐트 수술력, 10분 전 발생)'
          );
          setPatientInfo((prev) =>
            prev
              ? {
                  ...prev,
                  medications: ['와파린'],
                  surgery_history: ['심장 스텐트'],
                  onset_time: '10분 전',
                  missing_fields: [],
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error('마이크 녹음 오류:', err);
      setIsRecording(false);
    }
  };

  const handleDirectCall = (hospital: HospitalCall) => {
    Alert.alert(
      '직접 전화 연결',
      `${hospital.name}의 AI 자동 발신을 즉시 중단하고 구급대원이 직접 연결하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '직접 연결',
          onPress: () => {
            setIsDirectCallMode(true);
            setSelectedHospital(hospital);
            setStep(3.5);
          },
        },
      ]
    );
  };

  const resetAllToHome = () => {
    setIsRecording(false);
    setAudioUri(null);
    setTranscript('');
    setPatientInfo(null);
    setSelectedHospital(null);
    setIsDirectCallMode(false);
    setPressingId(null);
    holdAnim.setValue(0);
    slideAnim.setValue(0);
    setStep(1);
  };

  if (step === 1) {
    const hasResult = patientInfo !== null;
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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.centerSection}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.guideTitle}>
            {isRecording
              ? recordingMode === 'supplement'
                ? '누락된 항목을 말씀해 주세요'
                : '환자 상태를 말씀해 주세요'
              : hasResult
              ? `AI 4대 응급 분류: [${patientInfo.emergency_type}]`
              : '음성으로 환자 상태를 입력하세요'}
          </Text>
          <Text style={styles.guideSub}>
            {isRecording
              ? '말씀이 끝나면 [녹음 완료] 버튼을 눌러주세요'
              : hasResult
              ? 'AI가 추출한 환자 정보를 확인하고 필요 시 보완하세요'
              : '나이, 의식, 처치, 복용약, 수술력을 말하면 AI가 구조화합니다'}
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
              onPress={() => handleMicPress('initial')}
            >
              <Text style={styles.micIcon}>{isRecording ? '⏹️' : hasResult ? '🔄' : '🎙️'}</Text>
              <Text style={styles.micLabel}>
                {isRecording ? '녹음 완료' : hasResult ? '처음부터 다시' : '음성 녹음 시작'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.resultBox}>
            {isRecording ? (
              <Text style={styles.listeningText}>🔴 실시간 음성 녹음 중... (.m4a 생성 중)</Text>
            ) : hasResult ? (
              <>
                <Text style={styles.transcriptText}>"{transcript}"</Text>

                <View style={styles.schemaGrid}>
                  <View style={styles.schemaChip}>
                    <Text style={styles.schemaLabel}>분류</Text>
                    <Text style={styles.schemaValueUrgent}>{patientInfo.emergency_type}</Text>
                  </View>
                  <View style={styles.schemaChip}>
                    <Text style={styles.schemaLabel}>환자</Text>
                    <Text style={styles.schemaValue}>
                      {patientInfo.age ? `${patientInfo.age}세` : '미상'} ·{' '}
                      {patientInfo.sex === 'M' ? '남' : patientInfo.sex === 'F' ? '여' : '미상'}
                    </Text>
                  </View>
                  <View style={styles.schemaChip}>
                    <Text style={styles.schemaLabel}>의식/처치</Text>
                    <Text style={styles.schemaValue}>
                      {patientInfo.consciousness}
                      {patientInfo.cpr ? ` · CPR ${patientInfo.cpr_minutes || ''}분` : ''}
                    </Text>
                  </View>
                  <View style={styles.schemaChip}>
                    <Text style={styles.schemaLabel}>복용약/수술력</Text>
                    <Text style={styles.schemaValue}>
                      {patientInfo.medications.length > 0
                        ? patientInfo.medications.join(', ')
                        : '미확인'}{' '}
                      /{' '}
                      {patientInfo.surgery_history.length > 0
                        ? patientInfo.surgery_history.join(', ')
                        : '미확인'}
                    </Text>
                  </View>
                </View>

                {patientInfo.missing_fields.length > 0 && (
                  <View style={styles.missingBox}>
                    <Text style={styles.missingTitle}>
                      ❓ AI 되묻기: [{patientInfo.missing_fields.join(', ')}] 정보가 비어 있습니다.
                    </Text>
                    <TouchableOpacity
                      style={styles.supplementBtn}
                      onPress={() => handleMicPress('supplement')}
                    >
                      <Text style={styles.supplementBtnText}>🎙️ 누락 정보 추가 녹음하기</Text>
                    </TouchableOpacity>
                  </View>
                )}

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
        </ScrollView>

        {hasResult && patientInfo.emergency_type === '심정지' && !isRecording && (
          <TouchableOpacity
            style={styles.directPriorityBtn}
            onPress={() => {
              const nearest = [...JINJU_HOSPITALS]
                .map((h) => {
                  const dist = getDistanceKm(coords.lat, coords.lng, h.lat, h.lng);
                  return {
                    ...h,
                    distance: dist,
                    etaMin: Math.max(2, Math.round((dist / 45) * 60)),
                    status: '수락' as CallStatus,
                  };
                })
                .sort((a, b) => a.distance - b.distance)[0];
              handleDirectCall(nearest);
            }}
          >
            <Text style={styles.directPriorityBtnText}>
              ⚡ 심정지 최단거리 병원 즉시 직접 전화 모드
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, hasResult && !isRecording && styles.primaryBtnActive]}
          disabled={!hasResult || isRecording}
          onPress={() => {
            setIsDirectCallMode(false);
            setStep(2);
          }}
        >
          <Text style={styles.primaryBtnText}>
            {hasResult && !isRecording
              ? `>>> [${patientInfo.emergency_type}] AI 병원 호출 시작`
              : '먼저 환자 상태를 녹음하세요'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (step === 2) {
    const acceptedList = hospitals.filter((h) => h.status === '수락');
    const doctorCheckingCount = hospitals.filter((h) => h.status === '의사 확인 중').length;
    const waitingCount = hospitals.filter((h) => h.status === '발신 중').length;
    const rejectedCount = hospitals.filter((h) => h.status === '거절').length;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {renderStepHeader('병원 호출', 2)}

        <Text style={styles.subCaption}>
          {patientInfo?.emergency_type} · AI 음성 대본 발신 및 응답 분석 중
        </Text>

        <View style={styles.timerRow}>
          <Text style={styles.bigTimer}>{formatTime(callSeconds)}</Text>
          <Text style={styles.timerSuffix}>경과</Text>
        </View>

        <View style={styles.countGrid}>
          <View style={[styles.countBox, { borderColor: '#22C55E' }]}>
            <Text style={[styles.countLabel, { color: '#22C55E' }]}>✔ 수락</Text>
            <Text style={styles.countNumber}>{acceptedList.length}</Text>
          </View>
          <View style={[styles.countBox, { borderColor: '#3B82F6' }]}>
            <Text style={[styles.countLabel, { color: '#60A5FA' }]}>🩺 의사확인</Text>
            <Text style={styles.countNumber}>{doctorCheckingCount}</Text>
          </View>
          <View style={[styles.countBox, { borderColor: '#EAB308' }]}>
            <Text style={[styles.countLabel, { color: '#EAB308' }]}>💬 발신</Text>
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
            const isDoctorChecking = h.status === '의사 확인 중';
            const isRejected = h.status === '거절';
            return (
              <View
                key={h.id}
                style={[
                  styles.callRowCard,
                  isAccepted && { borderColor: '#22C55E' },
                  isDoctorChecking && { borderColor: '#3B82F6' },
                  isRejected && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.callStatusIcon}>
                  {isAccepted ? '🟢' : isDoctorChecking ? '🔵' : isRejected ? '✖' : '🟡'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.callHospitalName} numberOfLines={1}>
                    {h.name}
                  </Text>
                  <Text style={styles.callSubInfo}>
                    {h.distance}km · 약 {h.etaMin}분
                    {h.rejectReason ? ` (${h.rejectReason})` : ''}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.callStatusText,
                    isAccepted
                      ? { color: '#22C55E' }
                      : isDoctorChecking
                      ? { color: '#60A5FA' }
                      : isRejected
                      ? { color: '#9CA3AF' }
                      : { color: '#EAB308' },
                  ]}
                >
                  {h.status}
                </Text>

                {!isRejected && (
                  <TouchableOpacity
                    style={styles.directMiniBtn}
                    onPress={() => handleDirectCall(h)}
                  >
                    <Text style={styles.directMiniBtnText}>직접 전화</Text>
                  </TouchableOpacity>
                )}
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
            Alert.alert('호출 취소', '전체 AI 병원 호출이 취소되었습니다.');
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
          <Text style={styles.yellowBannerText}>● 수용 가능 병원 {acceptedSorted.length}곳</Text>
          <Text style={styles.yellowBannerTimer}>{formatTime(callSeconds)}</Text>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {acceptedSorted.map((h, index) => {
            const isFirst = index === 0;
            const isPressing = pressingId === h.id;
            const gaugeWidth = holdAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            });

            return (
              <TouchableOpacity
                key={h.id}
                activeOpacity={0.95}
                onPressIn={() => handleHoldStart(h)}
                onPressOut={handleHoldEnd}
                style={[
                  styles.selectCard,
                  isFirst && styles.selectCardFirst,
                  isPressing && styles.selectCardPressing,
                ]}
              >
                <View style={styles.rankRow}>
                  <View style={[styles.rankBadge, isFirst && styles.rankBadgeFirst]}>
                    <Text style={[styles.rankBadgeText, isFirst && { color: '#052E16' }]}>
                      {isFirst ? '1순위 · 가장 빠름' : `${index + 1}순위`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.cardDirectBtn}
                    onPress={() => handleDirectCall(h)}
                  >
                    <Text style={styles.cardDirectBtnText}>📞 직접 전화</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.selectHospitalName}>{h.name}</Text>

                <View style={styles.etaRow}>
                  <Text style={styles.bigEta}>{h.etaMin}</Text>
                  <Text style={styles.etaUnit}>분</Text>
                  <Text style={styles.selectDistance}>{h.distance}km</Text>
                </View>

                <View style={styles.holdProgressContainer}>
                  {isPressing && (
                    <Animated.View
                      style={[styles.holdProgressFill, { width: gaugeWidth }]}
                    />
                  )}
                  <Text
                    style={[
                      styles.longPressHintText,
                      isPressing && { color: '#FFFFFF', fontWeight: 'bold' },
                    ]}
                  >
                    {isPressing
                      ? '⏳ 연결 중... 끝까지 누르고 계세요'
                      : `✋ 꾹 눌러 수용 확정 및 직통 연결 (${h.phone})`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.bottomNotice}>
          {patientInfo?.emergency_type} · 확정 시 나머지 병원 AI 호출 자동 취소
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
          <Text style={styles.connectingSub}>
            {isDirectCallMode
              ? `구급대원 직접 전화 연결 중 (${selectedHospital.phone})`
              : `직통 연결 중 (${selectedHospital.phone})`}
          </Text>
          <Text style={styles.connectingCancelNote}>
            {isDirectCallMode
              ? '⚡ 해당 병원 AI 발신 즉시 중단됨'
              : '✖ 나머지 병원 AI 호출 취소됨'}
          </Text>
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
          <Text style={styles.confirmedSub}>
            {patientInfo?.emergency_type} · {isDirectCallMode ? '직접 통화 연결' : 'AI 수용 확정'}
          </Text>
        </View>
      </View>

      <View style={styles.etaSection}>
        <Text style={styles.etaLabel}>도착까지</Text>
        <Text style={styles.countdownText}>
          {Math.floor(arrivalSec / 60)}:{String(arrivalSec % 60).padStart(2, '0')}
        </Text>
        <Text style={styles.remainKm}>{selectedHospital?.distance || '2.4'} km 남음</Text>

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

        <View
          style={styles.endCallBtn}
          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width - 12)}
        >
          <Text style={styles.endCallText}>밀어서 통화 종료</Text>
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.endCallIconBox,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>》</Text>
          </Animated.View>
        </View>

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
  topNav: { marginBottom: 12 },
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
    marginBottom: 8,
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
  centerSection: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  guideTitle: { color: '#FFF', fontSize: 21, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  guideSub: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  micContainer: {
    width: 126,
    height: 126,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(225, 29, 72, 0.25)',
    borderWidth: 2,
    borderColor: '#E11D48',
  },
  micButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonIdle: { backgroundColor: '#2563EB' },
  micButtonRecording: { backgroundColor: '#E11D48' },
  micButtonDone: { backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#4B5563' },
  micIcon: { fontSize: 28, marginBottom: 4 },
  micLabel: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  resultBox: {
    width: '100%',
    minHeight: 110,
    backgroundColor: '#141619',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262930',
    justifyContent: 'center',
  },
  listeningText: { color: '#F87171', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  placeholderText: { color: '#6B7280', fontSize: 14, textAlign: 'center' },
  transcriptText: { color: '#F3F4F6', fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 10 },
  schemaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  schemaChip: {
    backgroundColor: '#1C1F24',
    borderWidth: 1,
    borderColor: '#2E333B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: '48%',
    flex: 1,
  },
  schemaLabel: { color: '#9CA3AF', fontSize: 11, marginBottom: 2 },
  schemaValue: { color: '#F9FAFB', fontSize: 13, fontWeight: 'bold' },
  schemaValueUrgent: { color: '#F87171', fontSize: 13, fontWeight: 'bold' },
  missingBox: {
    marginTop: 10,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderWidth: 1,
    borderColor: '#EAB308',
    borderRadius: 8,
    padding: 10,
  },
  missingTitle: { color: '#FDE047', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  supplementBtn: {
    backgroundColor: '#EAB308',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  supplementBtnText: { color: '#0B0C0E', fontSize: 12, fontWeight: 'bold' },
  audioFileText: {
    color: '#6EE7B7',
    fontSize: 11,
    marginTop: 10,
  },

  directPriorityBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  directPriorityBtnText: { color: '#7DD3FC', fontSize: 13, fontWeight: 'bold' },
  primaryBtn: {
    backgroundColor: '#1F2229',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnActive: { backgroundColor: '#E11D48' },
  primaryBtnGreen: { backgroundColor: '#22C55E' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },

  subCaption: { color: '#D1D5DB', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  bigTimer: { color: '#FFFFFF', fontSize: 48, fontWeight: '300', letterSpacing: 2 },
  timerSuffix: { color: '#9CA3AF', fontSize: 15, marginLeft: 8 },
  countGrid: { flexDirection: 'row', gap: 8 },
  countBox: {
    flex: 1,
    backgroundColor: '#141619',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
  },
  countLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  countNumber: { color: '#FFFFFF', fontSize: 26, fontWeight: 'bold' },
  callRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141619',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22252A',
    marginBottom: 8,
  },
  callStatusIcon: { fontSize: 14, marginRight: 10 },
  callHospitalName: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  callSubInfo: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  callStatusText: { fontSize: 12, fontWeight: 'bold', marginRight: 8 },
  directMiniBtn: {
    backgroundColor: '#262930',
    borderWidth: 1,
    borderColor: '#4B5563',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  directMiniBtnText: { color: '#E5E7EB', fontSize: 11, fontWeight: 'bold' },
  cancelOutlineBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 13,
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
  selectCardPressing: {
    borderColor: '#4ADE80',
    transform: [{ scale: 0.985 }],
  },
  rankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rankBadge: {
    backgroundColor: '#262930',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rankBadgeFirst: { backgroundColor: '#22C55E' },
  rankBadgeText: { color: '#D1D5DB', fontSize: 12, fontWeight: 'bold' },
  cardDirectBtn: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#4B5563',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cardDirectBtnText: { color: '#F3F4F6', fontSize: 12, fontWeight: 'bold' },
  selectHospitalName: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', marginBottom: 14 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  bigEta: { color: '#FFFFFF', fontSize: 44, fontWeight: 'bold' },
  etaUnit: { color: '#FFFFFF', fontSize: 18, marginLeft: 4, marginRight: 14 },
  selectDistance: { color: '#9CA3AF', fontSize: 16 },
  holdProgressContainer: {
    height: 40,
    backgroundColor: '#1E2229',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  holdProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#16A34A',
  },
  longPressHintText: { color: '#D1D5DB', fontSize: 13, fontWeight: '600', zIndex: 1 },
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
    height: 52,
    justifyContent: 'center',
    backgroundColor: '#141619',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
    position: 'relative',
  },
  endCallIconBox: {
    position: 'absolute',
    left: 6,
    width: 44,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E11D48',
    borderRadius: 8,
    zIndex: 2,
  },
  endCallText: {
    textAlign: 'center',
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: 'bold',
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