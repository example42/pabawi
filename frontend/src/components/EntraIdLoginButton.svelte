<script lang="ts">
  interface Props {
    providerName?: string;
  }

  let { providerName = 'Microsoft' }: Props = $props();

  function handleClick(): void {
    window.location.href = '/api/auth/entra-id/login';
  }
</script>

<button
  type="button"
  class="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-[#3c3c3c] shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-[#2f2f2f] dark:text-white dark:hover:bg-gray-700"
  aria-label="Sign in with {providerName}"
  onclick={handleClick}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 21 21"
    aria-hidden="true"
  >
    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
  </svg>
  <span>Sign in with {providerName}</span>
</button>
