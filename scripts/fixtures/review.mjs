// Each check gets fresh objects because review scenarios mutate nested state.
export function createReviewFixtures() {
  const image = 'https://pbs.twimg.com/media/a.jpg';
  const other = 'https://pbs.twimg.com/media/b.jpg';
  const x = {
    id: 'x:1',
    revision: 1,
    authorHandle: 'author',
    publishedAt: '2026-09-01',
    caption: '서연 사진',
    canonicalUrl: 'https://x.com/author/status/1',
    media: [{ previewUrl: image, kind: 'image' }],
    visible: false,
    decision: 'auto',
    comparisons: [{
      ownImage: image,
      image: other,
      url: 'https://x.com/other/status/2',
      author: 'other',
      publishedAt: '2026-09-01',
      visible: true,
      decision: 'auto',
      postId: 'x:2',
      revision: 7,
      exact: false,
    }],
  };
  const ig = {
    code: 'abc',
    revision: 3,
    url: 'https://www.instagram.com/p/abc/',
    author: 'instagram_author',
    publishedAt: '2026-09-01',
    caption: '서연',
    status: 'pending',
    images: [image],
    media: [{ previewUrl: image, kind: 'image' }],
    mediaCount: 1,
    firstSeenInTrial: false,
    reasons: [],
  };
  const event = {
    id: 'event-1',
    platform: 'X',
    targetType: 'IMAGE_PAIR',
    targetId: 'pair1',
    action: 'MARK_DIFFERENT_IMAGE',
    reasonCode: 'DISTINCT_IMAGE',
    note: '<img src=x onerror="window.injected=1"> ' + '긴 메모 '.repeat(150),
    reviewedBy: 'owner@example.test',
    reviewedAt: '2026-09-10T20:00:00Z',
    summary: { author: '<script>unsafe</script>', url: 'javascript:alert(1)' },
    previousState: {
      members: [
        { url: image, hash: 'a', confirmed_hash: 'group1' },
        { url: other, hash: 'b', confirmed_hash: 'group1' },
      ],
      different: false,
      groupRevision: 2,
    },
    newState: {
      members: [
        { url: image, hash: 'a', confirmed_hash: null },
        { url: other, hash: 'b', confirmed_hash: null },
      ],
      different: true,
      groupRevision: 3,
    },
    metadata: {
      images: [
        { url: image, posts: [{ id: 'x:1', url: x.canonicalUrl, author: 'author', position: 1 }] },
        { url: other, posts: [{ id: 'x:2', url: 'https://x.com/other/status/2', author: 'other', position: 1 }] },
      ],
      candidateEvidence: null,
      evidenceStatus: 'legacy_unavailable',
      evidenceKind: 'similarity_candidate',
      humanDecision: 'MARK_DIFFERENT_IMAGE',
    },
  };
  return { image, other, x, ig, event };
}
