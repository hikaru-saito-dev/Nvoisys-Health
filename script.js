document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = mobileMenu.querySelectorAll('a');

    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        if (mobileMenu.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-xmark');
        } else {
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        }
    });

    // Close mobile menu on link click
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('active');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        });
    });

    // 2. Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    
    // Initially check scroll position
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
            navbar.classList.remove('hidden');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 3. Reveal Animations on Scroll
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 // Element needs to be 15% visible to trigger
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Optional: Stop observing once revealed
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // 4. Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 5. Interactive SVG Chart Animation
    // We can animate the circle stroke when it comes into view
    const chartObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const circle = entry.target.querySelector('.circle');
                if (circle) {
                    // Reset animation by removing and re-adding class or inline style
                    circle.style.animation = 'none';
                    circle.offsetHeight; // trigger reflow
                    circle.style.animation = 'progress 1.5s ease-out forwards';
                }
            }
        });
    }, observerOptions);

    const chartElements = document.querySelectorAll('.circular-chart');
    chartElements.forEach(el => {
        chartObserver.observe(el);
    });

    // 6. Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    
    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
    }
    
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        if (newTheme === 'dark') {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    });

    // 7. Three.js 3D Earth Animation
    initEarth();
});

function initEarth() {
    const container = document.getElementById('earth-container');
    if (!container || typeof Globe === 'undefined') return;

    // Clear container
    container.innerHTML = '';
    
    // Explicitly grab dimensions so Globe.gl doesn't render at 0x0
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || 600;

    // Initialize photorealistic NASA Globe
    const myGlobe = Globe()
        (container)
        .width(w)
        .height(h)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .showAtmosphere(true)
        .atmosphereColor('lightskyblue')
        .atmosphereAltitude(0.15)
        .backgroundColor('rgba(0,0,0,0)'); // Transparent background to show website gradient

    // Setup initial camera and controls
    myGlobe.pointOfView({ lat: 0, lng: 78.9629, altitude: 2.5 });
    const controls = myGlobe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = false;

    // Each card links to a specific Indian city coordinate
    const cardTargets = [
        { id: 'card-wait-times',  lat: 28.6139, lng: 77.2090 },  // Delhi
        { id: 'card-cost',        lat: 19.0760, lng: 72.8777 },  // Mumbai
        { id: 'card-fragmented',  lat: 17.3850, lng: 78.4867 },  // Hyderabad
        { id: 'card-emergency',   lat: 12.9716, lng: 77.5946 }   // Bengaluru
    ];
    const linesSvg = document.getElementById('card-lines-svg');
    let linesVisible = false;

    // Create SVG line + dot elements inside the overlay
    cardTargets.forEach((ct, i) => {
        // The connecting line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.id = `connect-line-${i}`;
        line.setAttribute('stroke', '#00A69C');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('opacity', '0');
        line.style.filter = 'drop-shadow(0 0 4px rgba(0, 166, 156, 0.5))';
        line.style.transition = 'opacity 0.6s ease';
        if (linesSvg) linesSvg.appendChild(line);

        // A small glowing dot at the India end of the line
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.id = `connect-dot-${i}`;
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#ef4444');
        dot.setAttribute('opacity', '0');
        dot.style.filter = 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))';
        dot.style.transition = 'opacity 0.6s ease';
        if (linesSvg) linesSvg.appendChild(dot);
    });

    // Continuously update line positions from cards to their geo-pinned India coordinates
    function updateLines() {
        if (!linesVisible || !linesSvg) {
            requestAnimationFrame(updateLines);
            return;
        }

        const section = document.getElementById('problem');
        if (!section) { requestAnimationFrame(updateLines); return; }
        const sectionRect = section.getBoundingClientRect();

        // Get the globe's container bounds to offset the screen coords
        const containerRect = container.getBoundingClientRect();

        cardTargets.forEach((ct, i) => {
            const card = document.getElementById(ct.id);
            const line = document.getElementById(`connect-line-${i}`);
            const dot = document.getElementById(`connect-dot-${i}`);
            if (!card || !line) return;

            // Project the lat/lng to 2D screen coordinates using Globe.gl
            const screenCoords = myGlobe.getScreenCoords(ct.lat, ct.lng, 0.01);

            if (!screenCoords) {
                // Point is on the far side of the globe, hide this line
                line.setAttribute('opacity', '0');
                if (dot) dot.setAttribute('opacity', '0');
                return;
            }

            // screenCoords are relative to the globe container
            // Convert to section-relative coordinates
            const geoX = screenCoords.x + (containerRect.left - sectionRect.left);
            const geoY = screenCoords.y + (containerRect.top - sectionRect.top);

            // Card edge: pick the edge nearest to the geo point
            const cardRect = card.getBoundingClientRect();
            const cardCenterX = (cardRect.left + cardRect.width / 2) - sectionRect.left;
            const cardCenterY = (cardRect.top + cardRect.height / 2) - sectionRect.top;

            let startX, startY;
            if (cardCenterX < geoX) {
                startX = cardRect.right - sectionRect.left;
                startY = cardCenterY;
            } else {
                startX = cardRect.left - sectionRect.left;
                startY = cardCenterY;
            }

            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', geoX);
            line.setAttribute('y2', geoY);
            line.setAttribute('opacity', '1');

            if (dot) {
                dot.setAttribute('cx', geoX);
                dot.setAttribute('cy', geoY);
                dot.setAttribute('opacity', '1');
            }
        });

        requestAnimationFrame(updateLines);
    }
    updateLines();

    function showCardsAndLines() {
        cardTargets.forEach((ct, i) => {
            const card = document.getElementById(ct.id);
            const line = document.getElementById(`connect-line-${i}`);
            const dot = document.getElementById(`connect-dot-${i}`);
            if (card) {
                card.classList.add('visible');
                card.classList.add('connected');
            }
            if (line) line.setAttribute('opacity', '1');
            if (dot) dot.setAttribute('opacity', '1');
        });
        linesVisible = true;
    }

    function hideCardsAndLines() {
        cardTargets.forEach((ct, i) => {
            const card = document.getElementById(ct.id);
            const line = document.getElementById(`connect-line-${i}`);
            const dot = document.getElementById(`connect-dot-${i}`);
            if (card) {
                card.classList.remove('visible');
                card.classList.remove('connected');
            }
            if (line) line.setAttribute('opacity', '0');
            if (dot) dot.setAttribute('opacity', '0');
        });
        linesVisible = false;
    }

    // Observer to trigger zoom, cards, and lines
    const triggerSection = document.getElementById('problem');
    if (triggerSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Zoom smoothly to India
                    controls.autoRotate = false;
                    myGlobe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 1.0 }, 1500);

                    // Reveal cards and lines after zoom
                    setTimeout(showCardsAndLines, 1200);
                } else {
                    // Zoom back out and resume rotation
                    controls.autoRotate = true;
                    myGlobe.pointOfView({ lat: 0, lng: 78.9629, altitude: 2.5 }, 1000);
                    hideCardsAndLines();
                }
            });
        }, { threshold: 0.4 });

        observer.observe(triggerSection);
    }

    // Handle responsive resizing
    window.addEventListener('resize', () => {
        if (container) {
            myGlobe.width(container.clientWidth || window.innerWidth);
            myGlobe.height(container.clientHeight || 600);
        }
    });
}