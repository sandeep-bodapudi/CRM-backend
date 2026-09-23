/**
 * 5:00am-11:59am -> morning, 12:00pm-4:59pm -> afternoon, 5:00pm-4:59am -> evening.
 */
export const getTimeBasedGreeting = (date: Date = new Date()): string => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
};
