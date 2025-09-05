import React from 'react';
import '../styles/global.css';
import Head from 'next/head';

// Initialize OpenTelemetry on the client side
if (typeof window !== 'undefined') {
  import('../otel-client').then(({ initOtel }) => {
    initOtel();
  });
}

const App = ({ Component, pageProps }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onClickAnywhere = () => {
    inputRef.current.focus();
  };

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
          key="viewport"
        />
      </Head>

      <div
        className="text-light-foreground dark:text-dark-foreground w-full text-xs md:text-base"
        onClick={onClickAnywhere}
      >
        <main className="bg-light-background dark:bg-dark-background w-full h-full p-2">
          <Component {...pageProps} inputRef={inputRef} />
        </main>
      </div>
    </>
  );
};

export default App;
