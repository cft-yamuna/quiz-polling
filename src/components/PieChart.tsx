interface PieChartProps {
  data: { [key: string]: number };
  options: string[];
}

const VIEWBOX_SIZE = 420;
const CHART_CENTER = VIEWBOX_SIZE / 2;
const PIE_RADIUS = 180;
const LABEL_RADIUS = 90;

const GRADIENTS = [
  ['#A5B9C3', '#5A889C'],
  ['#C3D0D6', '#7B9AAA'],
  ['#B6C8D1', '#6A91A4'],
  ['#D2DCE1', '#8DA7B4'],
  ['#C7D5DB', '#7496A7'],
  ['#DCE4E8', '#97AEB9'],
  ['#BBCAD2', '#688B9C']
];

function segmentsCountSafe(data: { [key: string]: number }, options: string[]) {
  const counts = options.map((option) => data[option] || 0);
  return counts.length > 0 ? counts : [0];
}

export function PieChart({ data, options }: PieChartProps) {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  const chartFrameSize = 'clamp(730px, 37vw, 1300px)';
  const solidCircleSize = 'clamp(610px, 32vw, 1120px)';
  const statsWidth = 'clamp(560px, 31vw, 760px)';
  const topCount = Math.max(...segmentsCountSafe(data, options));

  let currentAngle = 0;
  const segments = options.map((option, index) => {
    const count = data[option] || 0;
    const percentage = total === 0 ? 0 : (count / total) * 100;
    const angle = total === 0 ? 0 : (count / total) * 360;

    const startAngle = currentAngle;
    currentAngle += angle;

    return {
      option,
      count,
      percentage,
      startAngle,
      angle,
      isLead: count > 0 && count === topCount && !options.slice(0, index).some((prev) => (data[prev] || 0) === topCount),
      gradient: GRADIENTS[index % GRADIENTS.length]
    };
  });

  const createArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(CHART_CENTER, CHART_CENTER, PIE_RADIUS, endAngle);
    const end = polarToCartesian(CHART_CENTER, CHART_CENTER, PIE_RADIUS, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', CHART_CENTER, CHART_CENTER,
      'L', start.x, start.y,
      'A', PIE_RADIUS, PIE_RADIUS, 0, largeArc, 0, end.x, end.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angle: number) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians)
    };
  };

  const getLabelPosition = (startAngle: number, angle: number) => {
    const midAngle = startAngle + angle / 2;
    return polarToCartesian(CHART_CENTER, CHART_CENTER, LABEL_RADIUS, midAngle);
  };

  const getOptionLabel = (index: number) => {
    return String.fromCharCode(97 + index);
  };

  const getSegmentPercentFontSize = (percentage: number) => {
    if (percentage >= 45) return 38;
    if (percentage >= 30) return 32;
    if (percentage >= 18) return 26;
    if (percentage >= 10) return 20;
    return 16;
  };

  const getSegmentOptionFontSize = (percentage: number) => {
    if (percentage >= 45) return 17;
    if (percentage >= 30) return 15;
    if (percentage >= 18) return 13;
    return 11;
  };

  const dominantSegment = total > 0
    ? segments.find((segment) => segment.count === total)
    : undefined;

  return (
    <div className="flex flex-col items-center gap-12 xl:-ml-64 xl:flex-row xl:items-center xl:justify-between xl:gap-44">
      <div
        className="relative flex shrink-0 items-center justify-center xl:mt-24"
        style={{ width: chartFrameSize, height: chartFrameSize }}
      >
        {total === 0 ? (
          <div
            className="flex items-center justify-center rounded-full border-[20px] border-[#dfe4ea] text-center"
            style={{ width: solidCircleSize, height: solidCircleSize }}
          >
            <div>
              <p
                className="font-black text-[#1652F0]"
                style={{ fontSize: '122.29px' }}
              >
                0%
              </p>
              <p
                className="mt-3 font-semibold uppercase tracking-[0.2em] text-slate-500"
                style={{ fontSize: '36.15px' }}
              >
                Waiting for responses
              </p>
            </div>
          </div>
        ) : dominantSegment ? (
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{ width: solidCircleSize, height: solidCircleSize }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: '#1652F0' }}
            />
            <div className="relative z-10 text-center text-white">
              <p
                className="font-black leading-none"
                style={{ fontSize: '122.29px' }}
              >
                100%
              </p>
              <p
                className="mt-4 font-semibold"
                style={{ fontSize: '36.15px' }}
              >
                {dominantSegment.option}
              </p>
            </div>
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {segments.map((segment, index) => (
                <linearGradient
                  key={`gradient-${index}`}
                  id={`segment-gradient-${index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={segment.isLead ? '#1652F0' : segment.gradient[0]} />
                  <stop offset="100%" stopColor={segment.isLead ? '#1652F0' : segment.gradient[1]} />
                </linearGradient>
              ))}
            </defs>
            {segments.map((segment, index) => (
              <g key={index}>
                <path
                  d={createArc(segment.startAngle, segment.startAngle + segment.angle)}
                  fill={`url(#segment-gradient-${index})`}
                />
                {segment.angle > 0 && (
                  <>
                    <text
                      x={getLabelPosition(segment.startAngle, segment.angle).x}
                      y={getLabelPosition(segment.startAngle, segment.angle).y - 6}
                      fill={segment.isLead ? 'white' : '#111111'}
                      fontSize={getSegmentPercentFontSize(segment.percentage)}
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {Math.round(segment.percentage)}%
                    </text>
                    <text
                      x={getLabelPosition(segment.startAngle, segment.angle).x}
                      y={getLabelPosition(segment.startAngle, segment.angle).y + 18}
                      fill={segment.isLead ? 'white' : '#111111'}
                      fontSize={getSegmentOptionFontSize(segment.percentage)}
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {`Option ${getOptionLabel(index)}`}
                    </text>
                  </>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>

      <div
        className="grid w-full grid-cols-1 gap-x-16 gap-y-12 sm:grid-cols-2 xl:-translate-x-20 xl:mt-[500px]"
        style={{ width: statsWidth, maxWidth: '100%' }}
      >
        {segments.map((segment, index) => (
          <div key={index} className="min-w-0">
            <p
              className="font-black leading-none tracking-[-0.06em] text-[#1652F0]"
              style={{
                display: 'inline-block',
                minWidth: '4.4ch',
                fontSize: '122.29px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(segment.percentage)}%
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-6 w-6 shrink-0"
                style={{
                  background: segment.isLead
                    ? '#1652F0'
                    : `linear-gradient(135deg, ${segment.gradient[0]}, ${segment.gradient[1]})`
                }}
              />
              <span
                className="break-words font-semibold text-slate-900"
                style={{ fontSize: '38.15px' }}
              >
                {segment.option}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
