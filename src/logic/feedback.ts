export function getIdiomFeedbackUrl(word = ''): string {
  const params = new URLSearchParams({
    title: word ? `成语数据错误：${word}` : '成语数据错误反馈',
    labels: '数据纠错',
  })
  return `https://github.com/ENILINE/handle/issues/new?${params}`
}
