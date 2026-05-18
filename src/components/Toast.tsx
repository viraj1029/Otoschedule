'use client';

interface Props {
  msg: string | null;
  err: boolean;
}

export default function Toast({ msg, err }: Props) {
  return (
    <div className={`toast${msg ? ' show' : ''}${err ? ' err' : ''}`}>
      {msg}
    </div>
  );
}
