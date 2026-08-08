import './styles.css';
import { CabinMayhemApp } from './app/cabin-mayhem-app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing application root.');

new CabinMayhemApp(root).mount();
