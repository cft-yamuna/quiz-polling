interface PieChartProps {
  data: { [key: string]: number };
  options: string[];
}

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
  const chartFrameSize = 'clamp(680px, 35vw, 1260px)';
  const solidCircleSize = 'clamp(580px, 30vw, 1080px)';
  const statsWidth = 'min(100%, 28vw)';
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
    const start = polarToCartesian(210, 210, 160, endAngle);
    const end = polarToCartesian(210, 210, 160, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', 210, 210,
      'L', start.x, start.y,
      'A', 160, 160, 0, largeArc, 0, end.x, end.y,
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
    return polarToCartesian(210, 210, 102, midAngle);
  };

  const getOptionLabel = (index: number) => {
    return String.fromCharCode(65 + index);
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
    <div className="flex flex-col items-center gap-12 xl:-ml-36 xl:flex-row xl:items-center xl:justify-between xl:gap-28">
      <div
        className="relative flex items-center justify-center xl:ml-6 xl:mt-24"
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
            viewBox="0 0 420 420"
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
                  <stop offset="100%" stopColor={segment.isLead ? '#4A7CFF' : segment.gradient[1]} />
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
        className="grid w-full grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2 xl:mt-44 xl:pl-16"
        style={{ maxWidth: statsWidth }}
      >
        {segments.map((segment, index) => (
          <div key={index} className="min-w-0">
            <p
              className="font-black leading-none text-[#1652F0]"
              style={{ fontSize: '122.29px' }}
            >
              {Math.round(segment.percentage)}%
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-6 w-6 shrink-0"
                style={{
                  background: segment.isLead
                    ? 'linear-gradient(135deg, #1652F0, #4A7CFF)'
                    : `linear-gradient(135deg, ${segment.gradient[0]}, ${segment.gradient[1]})`
                }}
              />
              <span
                className="break-words font-semibold text-slate-900"
                style={{ fontSize: '36.15px' }}
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
