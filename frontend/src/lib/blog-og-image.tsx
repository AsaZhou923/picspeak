import { ImageResponse } from 'next/og';
import { blogOgSize, type BlogOgFonts, truncateBlogOgText } from '@/lib/blog-og-types';

export { blogOgSize, type BlogOgFonts } from '@/lib/blog-og-types';

export function renderBlogOgImage(title: string, category: string, fonts: BlogOgFonts): ImageResponse {
  const safeTitle = truncateBlogOgText(title, 110);
  const safeCategory = truncateBlogOgText(category, 40);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '56px 64px',
          backgroundColor: '#0F0F17',
          color: '#E8E4DC',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(to right, #C8AB5A, #8B7340)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '420px',
            height: '420px',
            background: 'radial-gradient(circle, rgba(200,171,90,0.07) 0%, transparent 65%)',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'flex-start',
              padding: '8px 20px',
              borderRadius: '999px',
              border: '1px solid rgba(200,171,90,0.3)',
              fontSize: '20px',
              color: '#C8AB5A',
              letterSpacing: '0.12em',
              fontFamily: 'DM Sans',
              fontWeight: 500,
            }}
          >
            {safeCategory}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: '52px',
              fontWeight: 600,
              lineHeight: 1.15,
              color: '#F5F0E8',
              fontFamily: 'Cormorant Garamond',
              letterSpacing: '-0.01em',
              maxWidth: '960px',
            }}
          >
            {safeTitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(200,171,90,0.12)',
              border: '1px solid rgba(200,171,90,0.2)',
              fontSize: '18px',
              color: '#C8AB5A',
              fontFamily: 'Cormorant Garamond',
              fontWeight: 600,
            }}
          >
            P
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '24px',
              color: '#E8E4DC',
              fontFamily: 'DM Sans',
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            PicSpeak
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '18px',
              color: '#6B6560',
              fontFamily: 'DM Sans',
              fontWeight: 400,
            }}
          >
            Lens Notes
          </div>
        </div>
      </div>
    ),
    {
      width: blogOgSize.width,
      height: blogOgSize.height,
      fonts: [
        { name: 'Cormorant Garamond', data: fonts.display, weight: 600, style: 'normal' },
        { name: 'DM Sans', data: fonts.body, weight: 500, style: 'normal' },
      ],
    },
  );
}
