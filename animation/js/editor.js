import { Raycaster, Vector2, PerspectiveCamera, WebGLRenderer, Scene, Color, HemisphereLight, DirectionalLight, NearestFilter, LinearMipMapLinearFilter, MeshLambertMaterial, DoubleSide, OrthographicCamera, Texture } from "./three.js";
import { TBLModel } from "./tbl_loader.js";
import { DinosaurDisplay, DinosaurTexture, readFile } from "./displays.js";
import { OrbitControls } from './orbit_controls.js'
import { TransformControls } from './transform_controls.js'
import { KeyframeManger } from './keyframe_manager.js'
import { HistoryList } from "./history.js";
import { JavaMethodExporter } from "./java_method_exporter.js";
import { ByteBuffer } from "./animations.js"

const major = 0
const minor = 4
const patch = 8

const version = `${major}.${minor}.${patch}`
document.getElementById("dumbcode-studio-version").innerText = `v${version}`

const container = document.getElementById("editor-container")
const panel = document.getElementById("editor");
const canvasContainer = document.getElementById("display-div");
const progressionCanvas = document.getElementById("progression_canvas")
const display = new DinosaurDisplay()

let controls, transformControls
let selected
let intersected
let disableRaycast = false

let mouse = new Vector2(-5, -5);
let mouseClickDown = new Vector2(-5, -5)
let rawMouse = new Vector2();
let mouseDown = false

let material = new MeshLambertMaterial( {
    color: 0xAAAAAA,
    transparent: true,
    side: DoubleSide,
} )

let highlightMaterial = material.clone()
highlightMaterial.emissive.setHex( 0xFF0000 )

let selectedMaterial = material.clone()
selectedMaterial.emissive.setHex( 0x0000FF )

let mainModel
let modeCache, rotationCache

let texture = new DinosaurTexture()

let clickY; //Used to track what part of the border has been clicked
let panelHeight

let manager = new KeyframeManger(document.getElementById("keyframe-board"))
let methodExporter = new JavaMethodExporter()

window.daeHistory = new HistoryList()

let escapeCallback = () => {}

document.onkeydown = e => {
    if(e.keyCode === 27) { //escape
        escapeCallback()
    }

    if(e.ctrlKey && e.keyCode === 90) { //z
        if(e.shiftKey) {
            daeHistory.redo()
        } else {
            daeHistory.undo()
        }
    }

    if(e.ctrlKey && e.keyCode === 89) { //y
        daeHistory.redo()
    }
}

const keyframeCallback = () => {
    if(manager.selectedKeyFrame) {
        manager.selectedKeyFrame.selectChange(false)
    }
}
const dinosaurCallback = () => setAsSelected(undefined)

container.addEventListener("mousedown", () => escapeCallback = () => {
    if(manager.selectedKeyFrame) {
        keyframeCallback()
    } else {
        dinosaurCallback()
    }
})
canvasContainer.addEventListener("mousedown", () => escapeCallback = () => {
    if(selected) {
        dinosaurCallback()
    } else {
        keyframeCallback()
    }
})

function init() {
    manager.display = display;
    //Set up the renderer
    let renderer = new WebGLRenderer({
        alpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);

    //Set up the camera
    let camera = new PerspectiveCamera( 65, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 700 )
    camera.position.set(-3.745472848477101, 2.4616311452213426, -4.53288230701089)
    camera.lookAt(0, 0, 0)

    display.setup(canvasContainer, renderer, camera, createScene())

    //Set up the controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true
    controls.addEventListener('change', () => runFrame())

    transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.addEventListener('objectChange', () => {
        let pos = selected.parent.position
        let rot = selected.parent.rotation

        let rotations = [rot.x, rot.y, rot.z].map(a => a * 180 / Math.PI)
        let positions = [pos.x, pos.y, pos.z]

        setPosition(positions, false, false)
        setRotation(rotations, false, false)
        runFrame()
    } );
    transformControls.addEventListener('dragging-changed', e => {
        controls.enabled = !e.value;
    });
    transformControls.addEventListener('axis-changed', e => {
        let textDiv = document.getElementById("editor-mouseover")
        if(e.value === null) {
            textDiv.style.display = "block"
            if(intersected && intersected != selected) {
                intersected.material = material
            }
            disableRaycast = false
        } else {
            if(intersected && intersected != selected) {
                intersected.material = highlightMaterial
            }
            textDiv.style.display = "none"
            disableRaycast = true
        }
    })
    display.scene.add(transformControls)
    setMode("none", false)

    setHeights(320)
    frame()
}

function createScene() {
    //Set up the Scene
    let scene = new Scene();
    scene.background = new Color(0xaaaaaa);

    //Set up lighting
    scene.add(new HemisphereLight());
    let dirLight = new DirectionalLight()
    dirLight.position.set(-1.25, 1.5, 1)
    dirLight.target.position.set(1, -1, -1)
    scene.add(dirLight);

    return scene
}

function frame() {
    requestAnimationFrame(frame)
    runFrame()
}

function runFrame() {
    calculateIntersections()
    if(display.animationHandler) {
        manager.ensureFramePosition()
    }
    
    display.display(() => manager.setupSelectedPose())
    
    if(selected && display.animationHandler.playstate.playing) {
        let pos = selected.parent.position
        let rot = selected.parent.rotation
        setPosition([pos.x, pos.y, pos.z], true)
        setRotation([rot.x, rot.y, rot.z].map(a => a * 180 / Math.PI), true)
    }
}

function calculateIntersections() {
    let textDiv = document.getElementById("editor-mouseover")

    if(disableRaycast) {
        return
    }

    if(intersected) {
        let style = textDiv.style
        let divRect = textDiv.getBoundingClientRect()
        style.left = rawMouse.x - divRect.width/2 + "px"
        style.top = rawMouse.y - 35 + "px"
    }

    let raycaster = new Raycaster()
    raycaster.setFromCamera(mouse, display.camera);

    if(display.tbl) {
        let intersects = raycaster.intersectObjects(display.tbl.modelCache.children , true);
        if(!mouseDown && !document.getElementById("modal-settings").classList.contains("is-active")) {
            if(intersects.length > 0) {
                if(intersected != intersects[0].object) {
                    if(intersected && intersected != selected) {
                        intersected.material = material
                    }
        
                    intersected = intersects[0].object
                    textDiv.innerHTML = intersected.tabulaCube.name
                    
                    if(intersected != selected) {
                        intersected.material = highlightMaterial
                    } 
                } 
                textDiv.style.display = "block"
            } else {
                if(intersected && intersected != selected) {
                    intersected.material = material
                    intersected = null
                }
                textDiv.style.display = "none"
            }
        }
    }
}

function resize(e) {
    let range = window.innerHeight + canvasContainer.offsetTop
    let height = range - (e.y) + clickY

    let panelHeight = Math.min(Math.max(height, 100), 500)
    setHeights(panelHeight)
}

function setHeights(height) {
    panelHeight = height
    panel.style.height = panelHeight + "px";
    canvasContainer.style.height = (window.innerHeight - panelHeight) + "px"
    onWindowResize()
}

function setAsSelected(selectedElem, history = true) {
    if(history && selected != selectedElem) {
        let oldSelected = selected
        daeHistory.addAction(() => setAsSelected(oldSelected, false), () => setAsSelected(selectedElem, false))
    }
    let isSelected = selectedElem !== undefined;

    if(selected) {
        selected.material = material
        if(!isSelected) {
            transformControls.detach(selected);
        }
    }
    selected = selectedElem;
    if(selectedElem) {
        selectedElem.material = selectedMaterial
    }
    let visible = transformControls.visible
    transformControls.attach(selectedElem == undefined ? undefined : selectedElem.parent);
    setMode(visible ? transformControls.mode : "none", false);
    [...document.getElementsByClassName("editor-require-selected")].forEach(elem => {
        elem.disabled = !isSelected
        elem.classList.toggle("is-active", isSelected)
    })

    if(isSelected) {
        //Don't add history stuff, as we handle it ourselves
        setPosition(getSelectedPos(), false, false)
        setRotation(getSelectedRot(), false, false)
    } else {
        setPosition([0, 0, 0])
        setRotation([0, 0, 0])
    }
}

function setPosition(values, displaysonly = false, history = true) {
    [...document.getElementsByClassName("input-position")].forEach(elem => {
        elem.value = values[elem.getAttribute("axis")]
        elem.checkValidity()
    });
    if((!displaysonly) && selected) {
        if(history) {
            let pos = selected.parent.position
            let arr = [pos.x, pos.y, pos.z]
            daeHistory.addAction(() => setPosition(arr, false, false), () => {
                setPosition(values.slice(0), false, false)
            })
        } 
        selected.parent.position.set(values[0], values[1], values[2])
        
        if(manager.selectedKeyFrame) {
            manager.selectedKeyFrame.rotationPointMap.set(selected.tabulaCube.name, values)
            display.animationHandler.keyframesDirty()
        }
    }
}

function setRotation(values, displaysonly = false, history = true) {

    [...document.getElementsByClassName("input-rotation")].forEach(elem => {
        elem.value = values[elem.getAttribute("axis")]
    });

    [...document.getElementsByClassName("input-rotation-slider")].forEach(elem => {
        elem.value = ((values[elem.getAttribute("axis")] + 180) % 360) - 180
    });

    if(!displaysonly && selected) {
        if(history) {
            let rot = selected.parent.rotation
            let arr = [rot.x, rot.y, rot.z].map(v => v * 180 / Math.PI)
            daeHistory.addAction(() => setRotation(arr, false, false), () => setRotation(values, false, false))
        }

        selected.parent.rotation.set(values[0] * Math.PI / 180, values[1] * Math.PI / 180, values[2] * Math.PI / 180)

        if(manager.selectedKeyFrame) {
            manager.selectedKeyFrame.rotationMap.set(selected.tabulaCube.name, values)
            display.animationHandler.keyframesDirty()
        }
    }
}

export async function createGif(fps, progressCallback = undefined) {
    let color = parseInt(document.getElementById("gif_transparent_texture").value.substring(1), 16)
    return new Promise((resolve, reject) => {
        if(display.animationHandler.sortedTimes.length == 0) {
            reject("No Animation Playing")
            return
        }
    
        let width = window.innerWidth
        let height = window.innerHeight
    
        let gif = new GIF({
            workers: 2,
            quality: 10,
            width: width,
            height: height,
            workerScript: "./js/gif.worker.js",
            transparent: color
        });
    
        let dummyRenderer = new WebGLRenderer({
            alpha:true
        });
    
        dummyRenderer.setClearColor(color, 0);
        dummyRenderer.setSize( width, height );
    
        let dummyScene = createScene()
        dummyScene.background = new Color(color)
        dummyScene.add(display.tbl.modelCache)
    

        let dummyCamera = display.camera.clone()
        updateCamera(dummyCamera, width, height)

        display.tbl.resetAnimations()
        
        let delay = 1 / fps

        let start = 0
        let end = display.animationHandler.totalTime

        if(display.animationHandler.looping) {
            let kf = display.animationHandler.loopKeyframe
            start += kf.startTime + kf.duration
            end += kf.startTime + kf.duration
        }

        let ticks = manager.playstate.ticks
    
        manager.playstate.ticks = start
        manager.playstate.playing = true

        setTimeout(() => {
            while(manager.playstate.ticks < end) {
                display.animationHandler.animate(delay)
                dummyRenderer.render( dummyScene, dummyCamera )
                gif.addFrame(dummyRenderer.domElement, {copy: true, delay: delay * 1000})
            }

            manager.playstate.playing = false
            manager.playstate.ticks = ticks
            display.scene.add(display.tbl.modelCache)
            
            gif.on("finished", resolve);
            if(progressCallback) {
                gif.on("progress", progressCallback)
            }
            gif.render();
        }, 0)
        

    })
}

function updateCamera(camera, width, height) {
    if(camera.isPerspectiveCamera) {
        camera.aspect = width / height;
    }

    if(camera.isOrthographicCamera) {
        camera.left = width / -2
        camera.right = width / 2
        camera.top = height / 2
        camera.bottom = height / -2
    }
    camera.updateProjectionMatrix();
}

window.changeCamera = elem => {
    let cam
    switch(elem.value) {
        case "perspective":
            cam = new PerspectiveCamera( 65, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 700 )
            break;
        case "orthographic":
            cam = new OrthographicCamera(canvasContainer.clientWidth / -2, canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2, canvasContainer.clientHeight / -2, 0.1, 700)
            cam.zoom = 100
            cam.updateProjectionMatrix()
            break
    }
    cam.position.set(-3.745472848477101, 0.9616311452213426, -4.53288230701089)
    cam.lookAt(0, 0, 0)

    controls.object = cam
    display.camera = cam

}

window.downloadDCA = () => {
    if(display.animationHandler) {
        let buffer = new ByteBuffer()

        buffer.writeNumber(3) //version
        buffer.writeNumber(display.animationHandler.sortedTimes.length)

        display.animationHandler.sortedTimes.forEach(kf => {
            buffer.writeNumber(kf.startTime)
            buffer.writeNumber(kf.duration)
            
            writeMap(buffer, kf.fromRotationMap, kf.rotationMap, c => c.rotation)
            writeMap(buffer, kf.fromRotationPointMap, kf.rotationPointMap, c => c.rotationPoint)
        

            buffer.writeNumber(kf.progressionPoints.length)
            kf.progressionPoints.forEach(p => {
                buffer.writeNumber(p.x)
                buffer.writeNumber(p.y)
            })
        })


        let blob = new Blob([buffer.buffer]);
        let url = window.URL.createObjectURL(blob);

        let a = document.createElement("a");
        a.href = url;
        a.download = mainModel.name + ".dca";
        a.click();
        window.URL.revokeObjectURL(url);
    }
}

function writeMap(buffer, fromMap, map, cubeFunc) {
    let arr = []
    map.forEach((entry, cubename) => {
        if(!array3FuzzyEqual(entry, fromMap.get(cubename))) {
            arr.push({ cubename, entry })
        }
    })
    buffer.writeNumber(arr.length)
    arr.forEach(entry => {
        let arr = cubeFunc(display.tbl.cubeMap.get(entry.cubename))
        buffer.writeString(entry.cubename)
        buffer.writeNumber(entry.entry[0] - arr[0])
        buffer.writeNumber(entry.entry[1] - arr[1])
        buffer.writeNumber(entry.entry[2] - arr[2])
    })
}

function array3FuzzyEqual(arr1, arr2) {
    for(let i = 0; i < 3; ++i) {
        if(Math.abs(arr1[i] - arr2[i]) > 0.001) {
            return false
        }
    }
    return true
}

window.setupAnimation = async(file, nameElement) => {
    nameElement.classList.toggle("tooltip", true)
    nameElement.dataset.tooltip = file.name

    let buffer = new ByteBuffer(await readFile(file, (reader, file) => reader.readAsArrayBuffer(file)))
    let kfs = display.animationHandler.readDCAFile(buffer)

    display.animationHandler.keyframes = kfs
    display.animationHandler.keyframesDirty()

    //todo: remove all previous elements
    manager.reframeKeyframes()
}

window.downloadGif = async(elem) => {
    elem.classList.toggle("is-loading", true)
    elem.parentNode.classList.toggle("tooltip", true)

    elem.parentNode.dataset.tooltip = "Recording..."
    
    let fps = [...document.getElementsByClassName('fps-radio')].find(elem => elem.checked).getAttribute('fps');
    let blob = await createGif(fps, p => {
        elem.parentNode.dataset.tooltip = Math.round(p * 100) + "%"
    })

    if(blob) {
        let url = URL.createObjectURL(blob)
        let a = document.createElement("a");
        a.href = url;
        a.download = "dinosaur.gif" //todo: name from model?
        document.body.appendChild(a);
        a.click() 
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url); 
        }, 100)
    }

    elem.parentNode.classList.toggle("tooltip", false)
    elem.classList.toggle('is-loading', false)    
}

window.setSpeed = valueIn => {
    let value = Math.round(Math.pow(2, valueIn) * 100) / 100
    document.getElementById("playback-speed").innerHTML = value
    manager.playstate.speed = value
}

window.toggleTranslate = () => {
    if(transformControls.visible && transformControls.mode == "translate") {
        setMode("none")
    } else {
        setMode("translate")
    }
}

window.toggleRotate = () => {
    if(transformControls.visible && transformControls.mode == "rotate") {
        setMode("none")
    } else {
        setMode("rotate")
    }
}

window.toggleGlobal = (elem, addHistory = true) => {
    let wasLocal = transformControls.space == "local"
    setGlobal(elem, wasLocal)
    if(addHistory) {
        daeHistory.addAction(() => setGlobal(elem, !wasLocal), () => setGlobal(elem, wasLocal));
    }
    
}

function setGlobal(elem, world) {
    transformControls.space = world ? "world" : "local"
    elem.classList.toggle("is-active", world)
}

window.resetKeyFrames = () => {
    manager.playstate.ticks = 0
    display.animationHandler.tbl.resetAnimations()
}

function setMode(mode, updateHistory = true) {
    modeCache = mode
    if(!selected) {
        mode = "none"
    }
    if(updateHistory) {
        daeHistory.addAction(() => setMode(modeCache, false), () => setMode(mode, false) )
    }
    transformControls.visible = mode != "none"
    if(mode != "none") {
        transformControls.mode = mode

        let oldelement = document.getElementById("control-rotate")
        let newelement = document.getElementById("control-translate")
        if(mode == "rotate") {
            let e = oldelement
            oldelement = newelement
            newelement = e
        }

        oldelement.classList.toggle("is-active", false)
        newelement.classList.toggle("is-active", true)
    } else {
        [...document.getElementsByClassName("transform-control-tool")].forEach(elem => elem.classList.toggle("is-active", false))
    }
}

window.deleteKeyframe = () => {
    if(manager.selectedKeyFrame) {
        let index = display.animationHandler.keyframes.indexOf(manager.selectedKeyFrame)
        if(index >= 0) {
            let keyframe = manager.selectedKeyFrame

            let redo = () => {
                display.animationHandler.keyframes.splice(index, 1)
                manager.entryBoard.removeChild(keyframe.element)
                display.animationHandler.keyframesDirty()
                
                keyframe.selectChange(false)
                manager.reframeKeyframes()
            }

            daeHistory.addAction(() => {
                display.animationHandler.keyframes.splice(index, 0, keyframe)
                manager.entryBoard.appendChild(keyframe.element)
                display.animationHandler.keyframesDirty()

                keyframe.selectChange(true)
                manager.reframeKeyframes()
            }, redo)

            redo()
        }
    }
}

window.addKeyframe = () => {
    if(display.animationHandler) {

        let kf = display.animationHandler.createKeyframe()

        kf.duration = 5
        kf.startTime = manager.playstate.ticks
        let currentSelected = manager.selectedKeyFrame

        let redo = () => {
            display.animationHandler.keyframes.push(kf)
            display.animationHandler.keyframesDirty()
    
            manager.reframeKeyframes()
    
            kf.selectChange(true)
        }
        

        daeHistory.addAction(() => {
            display.animationHandler.keyframes.slice(display.animationHandler.keyframes.indexOf(kf), 1)
            manager.entryBoard.removeChild(kf.element)
            kf.element = false
            display.animationHandler.keyframesDirty()
            if(currentSelected) {
                currentSelected.selectChange(true)
            } else {
                kf.selectChange(false)
            }
        }, redo)

        redo()

    }
}

window.setStartTime = value => {
    value = Number(value)
    if(manager.selectedKeyFrame) {
        manager.selectedKeyFrame.startTime = value
        display.animationHandler.keyframesDirty()
        manager.updateKeyFrame(manager.selectedKeyFrame)
    }
}

window.setDuration = value => {
    value = Number(value)
    if(manager.selectedKeyFrame) {
        let diff = value - manager.selectedKeyFrame.duration
        manager.selectedKeyFrame.duration = value
        manager.selectedKeyFrame.startTime -= diff
        display.animationHandler.keyframesDirty()
        manager.updateKeyFrame(manager.selectedKeyFrame)
    }
}

window.setPosition = elem => {
    let num = Number(elem.value)
    if(Number.isNaN(num)) {
        return
    }
    let point = getSelectedPos()
    point[elem.getAttribute("axis")] = num
    setPosition(point)
}

function getSelectedPos() {
    let point
    if(manager.selectedKeyFrame) {
        point = manager.selectedKeyFrame.getPosition(selected.tabulaCube.name)
    } else {
        point = selected.parent.position.toArray()
    }
    return point
}


window.setRotation = (elem, history) => {
    let num = Number(elem.value)
    if(Number.isNaN(num)) {
        return
    }
    let angles = getSelectedRot()
    angles[elem.getAttribute("axis")] = num
    setRotation(angles, false, history)
}
function getSelectedRot() {
    let angles
    if(manager.selectedKeyFrame) {
        angles = manager.selectedKeyFrame.getRotation(selected.tabulaCube.name)
    } else {
        let rawr = selected.parent.rotation
        angles = [rawr.x, rawr.y, rawr.z].map(a => a * 180 / Math.PI)
    }
    return angles
}

window.setRotationHistory = () => {
    let rotation = getSelectedRot().splice(0)
    daeHistory.addAction(() => setRotation(rotationCache, false, false), () => setRotation(rotation, false, false))
}

window.storeRotationHistory = () => {
    rotationCache = getSelectedRot().splice(0)
}

window.setupMainModel = async(file, nameElement) => {
    mainModel = {name: file.name}
    nameElement.classList.toggle("tooltip", true)

    nameElement.dataset.tooltip = file.name

    try {
        mainModel.model = await TBLModel.loadModel(readFile(file))
    } catch(err) {
        nameElement.dataset.tooltip = "ERROR!"
        console.error(`Error from file ${file.name}: ${err.message}`)
    }

    if(!texture.texture) {
        texture = new DinosaurTexture()
        texture.setup()
    }

    display.setMainModel(material, texture, mainModel.model)
    display.animationHandler.playstate = manager.playstate
}
window.setupTexture = async(file, nameElement) => {
    let imgtag = document.createElement("img")
    nameElement.classList.toggle("tooltip", true)
    nameElement.dataset.tooltip = file.name

    imgtag.onload = () => {

        texture = new DinosaurTexture()
        let tex = new Texture(imgtag)

        tex.needsUpdate = true

        tex.flipY = false
        tex.magFilter = NearestFilter;
        tex.minFilter = NearestFilter;

        material.map = tex
        selectedMaterial.map = tex
        highlightMaterial.map = tex

        material.needsUpdate = true
        selectedMaterial.needsUpdate = true
        highlightMaterial.needsUpdate = true

        texture.texture = tex

        texture.setup()

        if(mainModel) {
            display.setMainModel(material, texture, mainModel.model)
            display.animationHandler.playstate = manager.playstate
        }
    }

    imgtag.onerror = () => {
        nameElement.dataset.tooltip = "ERROR!"
        console.error(`Unable to define image from file: ${file.name}`)
    }


    imgtag.src = await readFile(file, (reader, file) => reader.readAsDataURL(file))
}
window.onAnimationFileChange = async(files) => {
    await display.animationHandler.onAnimationFileChange(files)
    //todo: remove all previous elements
    manager.reframeKeyframes()
}
window.setInertia = elem => display.animationHandler.inertia = elem.checked
window.setLooped = elem => display.animationHandler.looping = elem.checked
window.setGrid = elem => display.gridGroup.visible = elem.checked
window.addValue = elem => {
    if(selected) {
        let axis = elem.getAttribute("axis")
        new ButtonSpeed().setupfor(elem, () => {
            let poss = getSelectedPos()
            poss[axis] += 0.1
            setPosition(poss)
        })
    }
}

window.subtractValue = elem => {
    if(selected) {
        let axis = elem.getAttribute("axis")
        new ButtonSpeed().setupfor(elem, () => {
            let poss = getSelectedPos()
            poss[axis] -= 0.1
            setPosition(poss)
        })
    }
}

window.setMappings = elem => {    
    elem.parentNode.querySelector(".is-active").classList.toggle("is-active", false)
    elem.classList.toggle("is-active", true)
    methodExporter.mappings = elem.getAttribute("mapping")
    window.generateJavaMethod()
}

window.generateJavaMethod = async() => {

    let animatedModel = document.getElementById("java-method-code-animated-model")
    animatedModel.innerText = await methodExporter.getText(`method_export/animated_model.txt`)

    let animatedEntityEntry = document.getElementById("java-method-code-animated-entity-entry")
    animatedEntityEntry.innerText = await methodExporter.getText(`method_export/animated_entity_entry.txt`)


    let elem = document.getElementById("java-method-code-result")
    let animationName = document.getElementById("java-method-name").value
    
    let times = display.animationHandler.sortedTimes
    let arrEqual = (arr1, arr2) => arr1[0] == arr2[0] && arr1[1] == arr2[1] && arr1[2] == arr2[2]
    
    let decimalCutoff = Math.pow(10, 3) //the 3 represents 3 decimal places
    let getNum = num => Math.round(num * decimalCutoff) / decimalCutoff

    let createSnapshot = () => {
        let snapshot = []
        display.tbl.cubeMap.forEach((value, name) => {
            let rot = value.cubeGroup.rotation
            let pos = value.cubeGroup.position

            snapshot.push( { name, rotation:[rot.x, rot.y, rot.z], position:[pos.x, pos.y, pos.z] } )
        })
        return snapshot
    }

    display.tbl.resetAnimations()
    let eventMap = new Map() //<float, cubereference[]>

    times.forEach(eventKf => {
        times.forEach(kf => kf.animate(eventKf.startTime, true))
        eventMap.set(eventKf.startTime, createSnapshot())

        times.forEach(kf => kf.animate(eventKf.startTime + eventKf.duration, true))
        eventMap.set(eventKf.startTime + eventKf.duration, createSnapshot())
    });

    let sorted = [...eventMap.keys()].sort((a, b) => a - b)
    let totalResult = display.animationHandler.totalTime

    let result = `
/**
 * Play the animation {@code ${animationName}}, which is ${totalResult} ticks long
 * @param entry The entry to run the animation on
 * @param ticksDone the amount of ticks that this animation has been running for. This doesn't have to start at 0
 * This method is generated from DumbCode Animation Studio v${version}
 */
private void playAnimation${animationName.charAt(0).toUpperCase() + animationName.slice(1)}(AnimatedEntityEntry entry, float ticksDone) {
    ticksDone *= ${manager.playstate.speed}; //Speed of the animation\n`
    if(display.animationHandler.looping) {
        result += `    ticksDone %= ${totalResult};  //Loop the animation\n`
    }

    result += `\n    int snapshotID;\n`

    for(let i = 0; i < sorted.length - 2; i++) {
        result += `    `
        if(i != 0) {
            result += `else `
        }
        result += `if(ticksDone < ${sorted[i + 1]}) snapshotID = ${i};\n`
    }
    result += `    else snapshotID = ${sorted.length - 2};
    entry.ensureSnapshot("${animationName}", snapshotID);
    `

    let previousSnapshot = false
    for(let i = 0; i < sorted.length - 1; i++) {
        let start = sorted[i]
        let end = sorted[i + 1]

        result += 
`
    if (ticksDone > ${start}) {
        float percentage = (ticksDone - ${start}F) / ${end - start}F;
        if(percentage > 1F) percentage = 1F;\n`

        let snapshot = eventMap.get(end)

        let captured = new Map()
        snapshot.forEach(ss => {
            captured.set(ss.name, {rotation:ss.rotation, position:ss.position})
            let skip = false
            if(previousSnapshot) {
                let ps = previousSnapshot.get(ss.name)
                if(arrEqual(ps.rotation, ss.rotation) && arrEqual(ps.position, ss.position)) {
                    skip = true
                }
            }
            if(!skip) {
                result += `        entry.setTransforms(this.${ss.name}, ${getNum(ss.position[0])}F, ${getNum(ss.position[1])}F, ${getNum(ss.position[2])}F, ${getNum(ss.rotation[0])}F, ${getNum(ss.rotation[1])}F, ${getNum(ss.rotation[2])}F, percentage);\n`
            }
        })
        result += "    }"
        previousSnapshot = captured   
    }

    result += 
    `\n
}`
    elem.innerText = result

}

window.addEventListener( 'resize', onWindowResize, false );
window.addEventListener( 'resize', () => setHeights(panelHeight), false );
document.addEventListener( 'mousemove', onMouseMove, false );

document.addEventListener( 'mousedown', onMouseDown, false );
document.addEventListener( 'mouseup', onMouseUp, false );

container.addEventListener("mousedown", e => {
    if (e.offsetY < 0) {
        clickY = 15 + e.offsetY
        document.addEventListener("mousemove", resize, false);
        document.body.className = "disable-select"
    }
}, false);

document.addEventListener("mouseup", () => {
    document.removeEventListener("mousemove", resize, false)
    document.body.className = undefined
}, false);

let selectedPoint = undefined
let ctx = progressionCanvas.getContext("2d");
let radius = 7.5

progressionCanvas.onmousedown = e => {

    if(manager.selectedKeyFrame !== undefined) {
        let points = manager.selectedKeyFrame.progressionPoints

        let width = progressionCanvas.width
        let height = progressionCanvas.height

        let clickedOn = points.find(p => !p.required && Math.pow(width*p.x-e.offsetX, 2) + Math.pow(height*p.y-e.offsetY, 2) <= 3*radius*radius) //The 3 is just for comedic effect.

        if(clickedOn !== undefined) {
            clickedOn.startX = clickedOn.x
            clickedOn.startY = clickedOn.y
            selectedPoint = clickedOn
        } else {
            let newPoint = { x: e.offsetX / width, y: e.offsetY / height }
            points.push( newPoint )
            manager.selectedKeyFrame.resortPointsDirty()
            selectedPoint = newPoint
        }

        redrawProgressionCanvas()
    }
}

progressionCanvas.onmousemove = e => {
    if(selectedPoint !== undefined) {
        selectedPoint.x = e.offsetX / progressionCanvas.width
        selectedPoint.y = e.offsetY / progressionCanvas.height
        redrawProgressionCanvas()
        manager.selectedKeyFrame.resortPointsDirty()
    }
}

progressionCanvas.onmouseup = () => {
    let width = progressionCanvas.width
    let height = progressionCanvas.height

    if(selectedPoint !== undefined) {
        if(selectedPoint.startX !== undefined && selectedPoint.startY !== undefined) {
            let distX = width*(selectedPoint.startX - selectedPoint.x)
            let distY = height*(selectedPoint.startY - selectedPoint.y)
            if(distX*distX + distY*distY < radius*radius*3) {
                manager.selectedKeyFrame.progressionPoints = manager.selectedKeyFrame.progressionPoints.filter(p => p !== selectedPoint)
                manager.selectedKeyFrame.resortPointsDirty()
            }
        }
        selectedPoint = undefined
        redrawProgressionCanvas()
    }
}

window.redrawProgressionCanvas = () => {
    if(manager.selectedKeyFrame !== undefined) {
        let width = progressionCanvas.width
        let height = progressionCanvas.height
    
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = "#363636";
        let points = manager.selectedKeyFrame.progressionPoints
    
        for(let i = 0; i < points.length; i++) {
            let point = points[i]
            let next = points[i+1]
    
            ctx.beginPath();
            ctx.arc(point.x * width, point.y * height, radius, 0, 2 * Math.PI);
    
            if(next !== undefined) {
                ctx.moveTo(point.x * width, point.y * height);
                ctx.lineTo(next.x * width, next.y * height);
            }
    
            ctx.stroke();
        }
    }
}

function onWindowResize() {
    let width = canvasContainer.clientWidth;
    let height = canvasContainer.clientHeight;
    updateCamera(display.camera, width, height)
    display.renderer.setSize( width, height );
}

function onMouseMove( event ) {
    rawMouse.x = event.clientX
    rawMouse.y = event.clientY

    let rect = canvasContainer.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;

}

function onMouseDown( event ) {
   mouseDown = true
   mouseClickDown.x = event.clientX
   mouseClickDown.y = event.clientY
}

function onMouseUp( event ) {
   mouseDown = false
   let xMove = Math.abs(mouseClickDown.x - event.clientX)
   let yMove = Math.abs(mouseClickDown.y - event.clientY)

   if(intersected && (xMove < 5 || yMove < 5)) {
       setAsSelected(intersected)
   }
}

class ButtonSpeed {

    setupfor(element, callback) {
        this.element = element;
        this.callback = callback

        this.mouseStillDown = true
        this.timeout = 500; //todo?

        this.mouseUp = () => {
            this.mouseStillDown = false
            clearInterval(this.interval)
            document.removeEventListener("mouseup", this.mouseUp)
        }

        document.addEventListener("mouseup", this.mouseUp )
        this.tick()
    }

    tick() {
        if(!this.mouseStillDown) {
            return;
        }

        this.callback()

        if(this.timeout > 1) {
            this.timeout -= 75
        }
        clearInterval(this.interval)
        this.interval = setInterval(() => this.tick(), this.timeout)
    }
}

init()
